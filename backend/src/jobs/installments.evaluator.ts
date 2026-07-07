import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CommandType,
  DeviceStatus,
  InstallmentStatus,
  LoanStatus,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommandsService } from '../commands/commands.service';
import { SmsService } from '../notifications/sms.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Nightly arrears evaluation: mark past-due installments OVERDUE, then for each
 * loan in arrears either send a reminder (within the grace window) or lock the
 * device (past grace). Runs per-tenant inside a CLS context so all queries and
 * commands are tenant-scoped.
 */
@Injectable()
export class InstallmentsEvaluator {
  private readonly logger = new Logger(InstallmentsEvaluator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly sms: SmsService,
    private readonly cls: ClsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDaily() {
    const summary = await this.evaluateAllTenants();
    this.logger.log(
      `Overdue sweep: ${summary.reminded} reminded, ${summary.locked} locked across ${summary.tenants} tenants`,
    );
  }

  /** Exposed so it can be triggered/tested directly, not only by the scheduler. */
  async evaluateAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, graceDays: true },
    });

    let reminded = 0;
    let locked = 0;
    for (const t of tenants) {
      await this.cls.run(async () => {
        this.cls.set(TENANT_ID_KEY, t.id);
        const r = await this.evaluateTenant(t.graceDays);
        reminded += r.reminded;
        locked += r.locked;
      });
    }
    return { tenants: tenants.length, reminded, locked };
  }

  private async evaluateTenant(tenantGraceDays: number) {
    const now = new Date();

    // 1. Flip past-due PENDING installments to OVERDUE.
    await this.prisma.scoped.installment.updateMany({
      where: { status: InstallmentStatus.PENDING, dueDate: { lt: now } },
      data: { status: InstallmentStatus.OVERDUE },
    });

    // 2. Active loans that now have overdue installments.
    const loans = await this.prisma.scoped.loan.findMany({
      where: {
        status: LoanStatus.ACTIVE,
        installments: { some: { status: InstallmentStatus.OVERDUE } },
      },
      select: {
        id: true,
        customer: { select: { phone: true, fullName: true } },
        device: { select: { id: true, status: true, graceDays: true } },
        installments: {
          where: { status: InstallmentStatus.OVERDUE },
          orderBy: { dueDate: 'asc' },
          select: { dueDate: true },
        },
      },
    });

    let reminded = 0;
    let locked = 0;
    for (const loan of loans) {
      const earliest = loan.installments[0]?.dueDate;
      if (!earliest || !loan.device) continue;

      const daysOverdue = Math.floor((now.getTime() - earliest.getTime()) / DAY_MS);
      const grace = loan.device.graceDays ?? tenantGraceDays;

      if (daysOverdue > grace) {
        if (loan.device.status === DeviceStatus.ACTIVE) {
          await this.commands.queue(loan.device.id, CommandType.LOCK, {
            reason: `installment overdue ${daysOverdue} day(s)`,
          });
          locked++;
        }
      } else if (loan.customer?.phone) {
        await this.sms.send(
          loan.customer.phone,
          `Dear ${loan.customer.fullName}, your phone installment is overdue. ` +
            `Please pay within ${grace - daysOverdue} day(s) to avoid your phone being locked.`,
        );
        reminded++;
      }
    }
    return { reminded, locked };
  }
}
