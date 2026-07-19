import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CommandType,
  DeviceStatus,
  InstallmentStatus,
  LoanStatus,
  Prisma,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommandsService } from '../commands/commands.service';
import { SmsService } from '../notifications/sms.service';
import { VoiceService } from '../notifications/voice.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';
import { CollectionsService } from '../collections/collections.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const BEFORE_DUE_DAYS = 1;

type ReminderType =
  | 'REMINDER_BEFORE_DUE'
  | 'REMINDER_DUE_TODAY'
  | 'REMINDER_GRACE'
  | 'REMINDER_LOCK_WARNING';

/**
 * Daily repayment evaluation. It sends staged reminders before locking:
 *  - 1 day before due date,
 *  - on due date,
 *  - during grace after a missed payment,
 *  - final lock warning on the last grace day,
 *  - lock after grace expires.
 * Runs per-tenant inside CLS so all queries and commands are tenant-scoped.
 */
@Injectable()
export class InstallmentsEvaluator {
  private readonly logger = new Logger(InstallmentsEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly sms: SmsService,
    private readonly voice: VoiceService,
    private readonly cls: ClsService,
    private readonly collections: CollectionsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDaily() {
    const summary = await this.evaluateAllTenants();
    this.logger.log(
      `Repayment sweep: ${summary.beforeDue} before-due, ${summary.dueToday} due-today, ` +
        `${summary.grace} grace, ${summary.lockWarnings} lock-warning, ` +
        `${summary.locked} locked across ${summary.tenants} tenants; ` +
        `collections cases synced=${summary.collectionCases}`,
    );
  }

  /** Exposed so it can be triggered/tested directly, not only by the scheduler. */
  async evaluateAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, graceDays: true },
    });

    const totals = emptySummary();
    let locked = 0;
    for (const t of tenants) {
      await this.cls.run(async () => {
        this.cls.set(TENANT_ID_KEY, t.id);
        const r = await this.evaluateTenant(t.graceDays);
        totals.beforeDue += r.beforeDue;
        totals.dueToday += r.dueToday;
        totals.grace += r.grace;
        totals.lockWarnings += r.lockWarnings;
        locked += r.locked;
      });
    }
    // After overdue statuses are updated, refresh managed collection cases.
    const coll = await this.collections.syncAllActiveSubscriptions();
    return {
      tenants: tenants.length,
      ...totals,
      locked,
      collectionCases: coll.cases,
    };
  }

  private async evaluateTenant(tenantGraceDays: number) {
    const now = new Date();
    const today = startOfDay(now);

    await this.prisma.scoped.installment.updateMany({
      where: { status: InstallmentStatus.PENDING, dueDate: { lt: now } },
      data: { status: InstallmentStatus.OVERDUE },
    });

    const loans = await this.prisma.scoped.loan.findMany({
      where: {
        status: LoanStatus.ACTIVE,
        installments: {
          some: { status: { in: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE] } },
        },
      },
      select: {
        id: true,
        currency: true,
        customer: { select: { phone: true, fullName: true } },
        device: { select: { id: true, status: true, graceDays: true } },
        installments: {
          where: { status: { in: [InstallmentStatus.PENDING, InstallmentStatus.OVERDUE] } },
          orderBy: { dueDate: 'asc' },
          take: 1,
          select: {
            id: true,
            sequence: true,
            dueDate: true,
            amount: true,
            amountPaid: true,
            status: true,
          },
        },
      },
    });

    const summary = emptySummary();
    let locked = 0;
    for (const loan of loans) {
      const installment = loan.installments[0];
      if (!installment || !loan.device || !loan.customer?.phone) continue;

      const grace = loan.device.graceDays ?? tenantGraceDays;
      const dueDay = startOfDay(installment.dueDate);
      const daysUntilDue = daysBetween(today, dueDay);
      const daysOverdue = daysBetween(dueDay, today);
      const amountDue = Math.max(
        Number(installment.amount) - Number(installment.amountPaid),
        0,
      );

      if (installment.status === InstallmentStatus.PENDING) {
        if (daysUntilDue === BEFORE_DUE_DAYS) {
          const sent = await this.sendReminderOnce({
            type: 'REMINDER_BEFORE_DUE',
            deviceId: loan.device.id,
            phone: loan.customer.phone,
            message:
              `Dear ${loan.customer.fullName}, your phone installment #${installment.sequence} ` +
              `of ${formatMoney(amountDue, loan.currency)} is due tomorrow.`,
            metadata: reminderMetadata(installment.id, amountDue, daysUntilDue),
          });
          if (sent) summary.beforeDue++;
        } else if (daysUntilDue === 0) {
          const sent = await this.sendReminderOnce({
            type: 'REMINDER_DUE_TODAY',
            deviceId: loan.device.id,
            phone: loan.customer.phone,
            message:
              `Dear ${loan.customer.fullName}, your phone installment #${installment.sequence} ` +
              `of ${formatMoney(amountDue, loan.currency)} is due today. Please pay on time to keep your phone active.`,
            metadata: reminderMetadata(installment.id, amountDue, daysUntilDue),
          });
          if (sent) summary.dueToday++;
        }
        continue;
      }

      if (daysOverdue > grace) {
        if (loan.device.status === DeviceStatus.ACTIVE) {
          await this.commands.queue(loan.device.id, CommandType.LOCK, {
            reason: `installment overdue ${daysOverdue} day(s)`,
          });
          await this.auditEvent(loan.device.id, 'LOCK_QUEUED_OVERDUE', {
            installmentId: installment.id,
            sequence: installment.sequence,
            amountDue,
            daysOverdue,
          });
          locked++;
        }
      } else if (daysOverdue === grace) {
        const sent = await this.sendReminderOnce({
          type: 'REMINDER_LOCK_WARNING',
          deviceId: loan.device.id,
          phone: loan.customer.phone,
          message:
            `Final reminder: your phone installment #${installment.sequence} is overdue. ` +
            `Pay ${formatMoney(amountDue, loan.currency)} today to avoid your phone being locked.`,
          metadata: reminderMetadata(installment.id, amountDue, daysOverdue),
        });
        if (sent) summary.lockWarnings++;
      } else {
        const daysLeft = Math.max(grace - daysOverdue, 0);
        const sent = await this.sendReminderOnce({
          type: 'REMINDER_GRACE',
          deviceId: loan.device.id,
          phone: loan.customer.phone,
          message:
            `Dear ${loan.customer.fullName}, your phone installment #${installment.sequence} is overdue. ` +
            `Please pay ${formatMoney(amountDue, loan.currency)} within ${daysLeft} day(s) to avoid your phone being locked.`,
          metadata: reminderMetadata(installment.id, amountDue, daysOverdue),
        });
        if (sent) summary.grace++;
      }
    }
    return { ...summary, locked };
  }

  private async sendReminderOnce(input: {
    type: ReminderType;
    deviceId: string;
    phone: string;
    message: string;
    metadata: Prisma.InputJsonObject;
  }) {
    if (await this.alreadyAuditedToday(input.deviceId, input.type, input.metadata)) {
      return false;
    }
    const sent = await this.sms.send(input.phone, input.message);
    const voice = await this.voice.callReminder(input.phone, voiceMessage(input.message));
    await this.auditEvent(input.deviceId, input.type, {
      ...input.metadata,
      phone: input.phone,
      sent,
      channel: 'SMS_AND_VOICE',
      smsSent: sent,
      voiceAttempted: true,
      voiceSent: voice.sent,
      voiceProviderRef: voice.providerRef,
    });
    return true;
  }

  private async auditEvent(
    deviceId: string,
    type: string,
    metadata: Prisma.InputJsonObject,
  ) {
    const device = await this.prisma.scoped.device.findFirst({
      where: { id: deviceId },
      select: { tenantId: true },
    });
    if (!device) return;
    await this.prisma.scoped.deviceEvent.create({
      data: { tenantId: device.tenantId, deviceId, type, metadata },
    });
  }

  private async alreadyAuditedToday(
    deviceId: string,
    type: ReminderType,
    metadata: Prisma.InputJsonObject,
  ) {
    const installmentId = String(metadata.installmentId ?? '');
    if (!installmentId) return false;
    const event = await this.prisma.scoped.deviceEvent.findFirst({
      where: {
        deviceId,
        type,
        createdAt: { gte: startOfDay(new Date()) },
        metadata: { path: ['installmentId'], equals: installmentId },
      },
      select: { id: true },
    });
    return !!event;
  }
}

function voiceMessage(message: string) {
  return `${message} If you have already paid, please ignore this call. For help, contact the shop.`;
}

function emptySummary() {
  return { beforeDue: 0, dueToday: 0, grace: 0, lockWarnings: 0 };
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function reminderMetadata(
  installmentId: string,
  amountDue: number,
  dayValue: number,
): Prisma.InputJsonObject {
  return {
    installmentId,
    amountDue,
    dayValue,
    reminderDate: startOfDay(new Date()).toISOString(),
  };
}
