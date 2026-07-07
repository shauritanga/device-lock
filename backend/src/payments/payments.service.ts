import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommandStatus,
  CommandType,
  DeviceStatus,
  InstallmentStatus,
  LoanStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../common/prisma/prisma.service';
import { CommandsService } from '../commands/commands.service';
import { ClickPesaService } from '../integrations/clickpesa/clickpesa.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';
import { randomToken } from '../common/crypto.util';
import { InitiatePaymentDto, RecordPaymentDto } from './dto/payment.dto';

const toCents = (d: Prisma.Decimal | number | string) =>
  Math.round(Number(d) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly clickpesa: ClickPesaService,
    private readonly cls: ClsService,
  ) {}

  /** Record a manual (e.g. cash) payment and apply it immediately. */
  async recordManual(dto: RecordPaymentDto) {
    const loan = await this.requireLoan(dto.loanId);
    const payment = await this.prisma.scoped.payment.create({
      data: {
        tenantId: loan.tenantId,
        loanId: loan.id,
        amount: dto.amount,
        method: dto.method ?? PaymentMethod.CASH,
        status: PaymentStatus.CONFIRMED,
      },
    });
    await this.applyConfirmed(payment.id);
    return this.prisma.scoped.payment.findFirst({ where: { id: payment.id } });
  }

  /** Start a ClickPesa USSD-push collection; payment confirmed later by webhook. */
  async initiateMobileMoney(dto: InitiatePaymentDto) {
    const loan = await this.requireLoan(dto.loanId);
    const orderReference = `DL${randomToken(8)}`.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const payment = await this.prisma.scoped.payment.create({
      data: {
        tenantId: loan.tenantId,
        loanId: loan.id,
        amount: dto.amount,
        method: PaymentMethod.MPESA, // actual channel returned by webhook
        status: PaymentStatus.PENDING,
        orderReference,
        phoneNumber: dto.phoneNumber,
      },
    });

    if (!this.clickpesa.configured) {
      // No credentials (dev): record the intent; the USSD push isn't sent, but
      // the webhook can still confirm this orderReference.
      this.logger.warn(
        `ClickPesa not configured; recorded intent ${orderReference} without push`,
      );
      return { paymentId: payment.id, orderReference, status: 'PENDING' };
    }

    const res = await this.clickpesa.initiateUssdPush({
      amount: fromCents(toCents(dto.amount)),
      orderReference,
      phoneNumber: dto.phoneNumber,
    });

    await this.prisma.scoped.payment.update({
      where: { id: payment.id },
      data: { providerRef: res.id },
    });
    return { paymentId: payment.id, orderReference, status: res.status };
  }

  list() {
    return this.prisma.scoped.payment.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Webhook entrypoint. Sets tenant context and applies the resolved outcome
   * idempotently:
   *  - 'received' -> confirm + allocate funds (may auto-unlock),
   *  - 'reversed' -> mark reversed + rebuild allocations (may re-lock),
   *  - 'failed'   -> mark failed (only if not already confirmed).
   */
  async confirmFromWebhook(
    orderReference: string,
    providerRef: string | undefined,
    outcome: 'received' | 'failed' | 'reversed',
    raw: Prisma.InputJsonValue,
  ): Promise<'applied' | 'reversed' | 'duplicate' | 'unmatched' | 'failed'> {
    // Unscoped lookup (no tenant context on a public webhook).
    const payment = await this.prisma.payment.findUnique({
      where: { orderReference },
    });
    if (!payment) return 'unmatched';

    // Make subsequent scoped writes operate within this payment's tenant.
    this.cls.set(TENANT_ID_KEY, payment.tenantId);

    if (outcome === 'reversed') {
      if (payment.status === PaymentStatus.REVERSED) return 'duplicate';
      const wasConfirmed = payment.status === PaymentStatus.CONFIRMED;
      await this.prisma.scoped.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REVERSED,
          providerRef: providerRef ?? payment.providerRef,
          rawPayload: raw,
        },
      });
      // Only funds that had actually been applied need clawing back.
      if (wasConfirmed) {
        await this.recompute(payment.loanId);
        await this.maybeReLock(payment.loanId);
      }
      return 'reversed';
    }

    if (payment.status === PaymentStatus.CONFIRMED) return 'duplicate';

    if (outcome === 'failed') {
      await this.prisma.scoped.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, rawPayload: raw },
      });
      return 'failed';
    }

    const channel = (raw as { channel?: string } | null)?.channel;
    await this.prisma.scoped.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CONFIRMED,
        providerRef: providerRef ?? payment.providerRef,
        method: this.mapChannel(channel) ?? payment.method,
        rawPayload: raw,
      },
    });
    await this.recompute(payment.loanId);
    await this.settleDeviceState(payment.loanId);
    return 'applied';
  }

  /** Map a ClickPesa channel string (e.g. "M-PESA") to our PaymentMethod. */
  private mapChannel(channel?: string): PaymentMethod | undefined {
    if (!channel) return undefined;
    const c = channel.toUpperCase();
    if (c.includes('MPESA') || c.includes('M-PESA')) return PaymentMethod.MPESA;
    if (c.includes('TIGO')) return PaymentMethod.TIGOPESA;
    if (c.includes('AIRTEL')) return PaymentMethod.AIRTELMONEY;
    if (c.includes('CARD')) return PaymentMethod.CARD;
    return undefined;
  }

  /** Apply a confirmed payment: rebuild allocations, then settle/unlock. */
  private async applyConfirmed(paymentId: string) {
    const payment = await this.prisma.scoped.payment.findFirst({
      where: { id: paymentId },
      select: { loanId: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.recompute(payment.loanId);
    await this.settleDeviceState(payment.loanId);
  }

  /**
   * After a confirmed payment, drive the device to the state the loan now
   * implies: a fully-paid loan hands the device over (RELEASE); an outstanding
   * loan whose arrears just cleared is unlocked. Release is deliberately routed
   * only through loan-COMPLETED here — the device is never released off the back
   * of a single payment, only when the whole loan is settled.
   */
  private async settleDeviceState(loanId: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: loanId },
      select: { status: true },
    });
    if (loan?.status === LoanStatus.COMPLETED) {
      await this.maybeRelease(loanId);
    } else {
      await this.maybeAutoUnlock(loanId);
    }
  }

  /**
   * Loan fully paid: queue a RELEASE so the agent relinquishes device-owner and
   * hands the phone to the customer. Skipped if the device is already released
   * (or never fully managed), and de-duped against an in-flight RELEASE.
   */
  private async maybeRelease(loanId: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: loanId },
      select: { deviceId: true, status: true },
    });
    if (!loan || loan.status !== LoanStatus.COMPLETED) return;

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: loan.deviceId },
      select: { id: true, status: true },
    });
    if (!device) return;
    if (
      device.status === DeviceStatus.RELEASED ||
      device.status === DeviceStatus.PENDING_ENROLLMENT ||
      device.status === DeviceStatus.WIPED
    ) {
      return;
    }

    const inFlight = await this.prisma.scoped.deviceCommand.count({
      where: {
        deviceId: device.id,
        type: CommandType.RELEASE,
        status: { in: [CommandStatus.QUEUED, CommandStatus.SENT] },
      },
    });
    if (inFlight > 0) return;

    this.logger.log(`Releasing device ${device.id} — loan ${loanId} completed`);
    await this.commands.queue(device.id, CommandType.RELEASE, {
      reason: 'loan completed — device released',
    });
  }

  /**
   * Rebuild a loan's installment paid-state from all CONFIRMED payments, in
   * sequence order. This is the single source of truth for allocations, so it
   * is correct both when a payment lands and when one is later reversed (the
   * reversed payment simply drops out of the CONFIRMED pool). WAIVED
   * installments are left untouched. Idempotent.
   */
  private async recompute(loanId: string) {
    const now = new Date();
    const [installments, confirmed] = await Promise.all([
      this.prisma.scoped.installment.findMany({
        where: { loanId },
        orderBy: { sequence: 'asc' },
      }),
      this.prisma.scoped.payment.findMany({
        where: { loanId, status: PaymentStatus.CONFIRMED },
        select: { amount: true },
      }),
    ]);
    let pool = confirmed.reduce((sum, p) => sum + toCents(p.amount), 0);

    await this.prisma.scoped.$transaction(async (tx) => {
      let allSettled = true;
      for (const inst of installments) {
        if (inst.status === InstallmentStatus.WAIVED) continue; // already settled
        const amount = toCents(inst.amount);
        const pay = Math.min(pool, amount);
        pool -= pay;
        const cleared = pay >= amount;
        if (!cleared) allSettled = false;
        await tx.installment.update({
          where: { id: inst.id },
          data: {
            amountPaid: fromCents(pay),
            status: cleared
              ? InstallmentStatus.PAID
              : inst.dueDate < now
                ? InstallmentStatus.OVERDUE
                : InstallmentStatus.PENDING,
            paidAt: cleared ? (inst.paidAt ?? now) : null,
          },
        });
      }

      // Reflect completion, and un-complete a loan whose funds were pulled back.
      const loan = await tx.loan.findFirst({
        where: { id: loanId },
        select: { status: true },
      });
      if (allSettled && loan?.status !== LoanStatus.COMPLETED) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: LoanStatus.COMPLETED },
        });
      } else if (!allSettled && loan?.status === LoanStatus.COMPLETED) {
        await tx.loan.update({
          where: { id: loanId },
          data: { status: LoanStatus.ACTIVE },
        });
      }
    });
  }

  /** After a reversal reinstates arrears, re-lock an active device. */
  private async maybeReLock(loanId: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: loanId },
      select: { deviceId: true },
    });
    if (!loan) return;

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: loan.deviceId },
      select: { id: true, status: true },
    });
    if (!device || device.status !== DeviceStatus.ACTIVE) return;

    const arrears = await this.prisma.scoped.installment.count({
      where: {
        loanId,
        dueDate: { lte: new Date() },
        status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.WAIVED] },
      },
    });
    if (arrears > 0) {
      this.logger.log(`Re-locking device ${device.id} after payment reversal`);
      await this.commands.queue(device.id, CommandType.LOCK, {
        reason: 'payment reversed — arrears reinstated',
      });
    }
  }

  /** If the device is LOCKED and arrears are now cleared, queue an UNLOCK. */
  private async maybeAutoUnlock(loanId: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: loanId },
      select: { deviceId: true },
    });
    if (!loan) return;

    const device = await this.prisma.scoped.device.findFirst({
      where: { id: loan.deviceId },
      select: { id: true, status: true },
    });
    if (!device || device.status !== DeviceStatus.LOCKED) return;

    const arrears = await this.prisma.scoped.installment.count({
      where: {
        loanId,
        dueDate: { lte: new Date() },
        status: { notIn: [InstallmentStatus.PAID, InstallmentStatus.WAIVED] },
      },
    });
    if (arrears === 0) {
      this.logger.log(`Auto-unlocking device ${device.id} after payment`);
      await this.commands.queue(device.id, CommandType.UNLOCK, {
        reason: 'payment received — arrears cleared',
      });
    }
  }

  private async requireLoan(loanId: string) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: loanId },
      select: { id: true, tenantId: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }
}
