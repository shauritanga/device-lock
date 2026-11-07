import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
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
import {
  SNIPPE_MIN_COLLECTION,
  SnippePayment,
  SnippeRejectedError,
  SnippeService,
} from '../integrations/snippe/snippe.service';
import { PayoutsService } from './payouts.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';
import { randomToken } from '../common/crypto.util';
import {
  InitiatePaymentDto,
  MarkInstallmentPaidDto,
  RecordPaymentDto,
} from './dto/payment.dto';
import { CollectionsService } from '../collections/collections.service';

const toCents = (d: Prisma.Decimal | number | string) =>
  Math.round(Number(d) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commands: CommandsService,
    private readonly snippe: SnippeService,
    private readonly payouts: PayoutsService,
    private readonly cls: ClsService,
    @Inject(forwardRef(() => CollectionsService))
    private readonly collections: CollectionsService,
  ) {}

  /**
   * What is still owed on a loan: unsettled instalment amounts less everything
   * already confirmed. Waived instalments are excluded. This is the exact figure
   * that completes the loan (and so releases the phone) when paid in one go.
   */
  async loanBalance(loanId: string) {
    await this.requireLoan(loanId);
    const [installments, confirmed] = await Promise.all([
      this.prisma.scoped.installment.findMany({
        where: { loanId, status: { not: InstallmentStatus.WAIVED } },
        select: { amount: true, status: true },
      }),
      this.prisma.scoped.payment.findMany({
        where: { loanId, status: PaymentStatus.CONFIRMED },
        select: { amount: true },
      }),
    ]);
    const due = installments.reduce((t, i) => t + toCents(i.amount), 0);
    const paid = confirmed.reduce((t, p) => t + toCents(p.amount), 0);
    const outstanding = Math.max(0, due - paid);
    return {
      outstanding: Number(fromCents(outstanding)),
      installmentsLeft: installments.filter((i) => i.status !== InstallmentStatus.PAID)
        .length,
    };
  }

  /** Refuse a payment bigger than what is owed — the excess would be silently lost. */
  private async assertWithinBalance(loanId: string, amount: number) {
    const { outstanding } = await this.loanBalance(loanId);
    if (outstanding <= 0) {
      throw new BadRequestException('This loan is already fully paid');
    }
    if (toCents(amount) > toCents(outstanding)) {
      throw new BadRequestException(
        `Amount exceeds the ${outstanding.toLocaleString('en-US')} still owed on this loan`,
      );
    }
  }

  /** Record a manual (e.g. cash) payment and apply it immediately. */
  async recordManual(dto: RecordPaymentDto) {
    const loan = await this.requireLoan(dto.loanId);
    await this.assertWithinBalance(loan.id, dto.amount);
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

  /**
   * Mark one installment paid from the console (till/cash received in advance
   * of — or outside — the mobile-money gateway). Creates a CONFIRMED manual
   * payment for the installment's outstanding balance (or a smaller partial
   * amount) and runs the same allocation + unlock/release flow as any payment.
   *
   * Payments allocate oldest-first, so earlier unpaid installments must be
   * cleared before a later one can be marked paid.
   */
  async recordInstallmentPayment(
    installmentId: string,
    dto: MarkInstallmentPaidDto,
  ) {
    const installment = await this.prisma.scoped.installment.findFirst({
      where: { id: installmentId },
      include: { loan: { select: { id: true, tenantId: true, status: true } } },
    });
    if (!installment?.loan) throw new NotFoundException('Installment not found');
    if (installment.loan.status !== LoanStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE loans can take payments');
    }
    if (
      installment.status === InstallmentStatus.PAID ||
      installment.status === InstallmentStatus.WAIVED
    ) {
      throw new BadRequestException('Installment is already settled');
    }

    const remaining =
      toCents(installment.amount) - toCents(installment.amountPaid);
    if (remaining <= 0) {
      throw new BadRequestException('Installment is already settled');
    }

    const earlierUnpaid = await this.prisma.scoped.installment.findFirst({
      where: {
        loanId: installment.loanId,
        sequence: { lt: installment.sequence },
        status: {
          notIn: [InstallmentStatus.PAID, InstallmentStatus.WAIVED],
        },
      },
      orderBy: { sequence: 'asc' },
      select: { sequence: true },
    });
    if (earlierUnpaid) {
      throw new BadRequestException(
        `Clear installment #${earlierUnpaid.sequence} first — payments apply oldest-first`,
      );
    }

    const payCents =
      dto.amount !== undefined && dto.amount !== null
        ? toCents(dto.amount)
        : remaining;
    if (payCents <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (payCents > remaining) {
      throw new BadRequestException(
        `Amount exceeds the ${fromCents(remaining)} outstanding on installment #${installment.sequence}`,
      );
    }

    const payment = await this.prisma.scoped.payment.create({
      data: {
        tenantId: installment.loan.tenantId,
        loanId: installment.loanId,
        amount: fromCents(payCents),
        method: dto.method ?? PaymentMethod.CASH,
        status: PaymentStatus.CONFIRMED,
      },
    });
    await this.applyConfirmed(payment.id);
    const updated = await this.prisma.scoped.installment.findFirst({
      where: { id: installmentId },
    });
    return { payment, installment: updated };
  }

  /**
   * Start a Snippe USSD-push collection. The payment stays PENDING until Snippe
   * reports it completed (webhook, or the reconcile poller as a fallback).
   */
  async initiateMobileMoney(dto: InitiatePaymentDto) {
    const loan = await this.prisma.scoped.loan.findFirst({
      where: { id: dto.loanId },
      select: {
        id: true,
        tenantId: true,
        customer: { select: { id: true, fullName: true } },
      },
    });
    if (!loan) throw new NotFoundException('Loan not found');

    // Snippe takes whole shillings only.
    const amount = Math.round(dto.amount);
    await this.assertWithinBalance(loan.id, amount);
    if (amount < SNIPPE_MIN_COLLECTION) {
      throw new BadRequestException(
        `Mobile-money payments must be at least ${SNIPPE_MIN_COLLECTION} TZS`,
      );
    }

    const orderReference = `DL${randomToken(8)}`
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    const payment = await this.prisma.scoped.payment.create({
      data: {
        tenantId: loan.tenantId,
        loanId: loan.id,
        amount,
        method: PaymentMethod.MPESA, // refined from the gateway channel on completion
        status: PaymentStatus.PENDING,
        provider: 'SNIPPE',
        orderReference,
        phoneNumber: dto.phoneNumber,
      },
    });

    if (!this.snippe.configured) {
      this.logger.warn(
        `Snippe not configured; recorded intent ${orderReference} without push`,
      );
      return { paymentId: payment.id, orderReference, status: 'PENDING' };
    }

    const [firstname, ...rest] = loan.customer.fullName.trim().split(/\s+/);
    try {
      const res = await this.snippe.createPayment({
        amount,
        phone: dto.phoneNumber,
        // Snippe requires an email; customers don't have one, so use a stable placeholder.
        customer: {
          firstname: firstname || 'Customer',
          lastname: rest.join(' ') || firstname || 'Customer',
          email: `${loan.customer.id}@customers.linda.co.tz`,
        },
        idempotencyKey: orderReference,
        webhookUrl: this.webhookUrl(),
        metadata: {
          order_reference: orderReference,
          payment_id: payment.id,
          loan_id: loan.id,
          tenant_id: loan.tenantId,
        },
      });
      // Snippe can answer a repeat request (same phone and amount, previous one
      // still waiting) with the reference it already issued. That reference
      // belongs to the earlier payment, so don't create a second record for it.
      const existing = await this.prisma.payment.findUnique({
        where: { providerRef: res.reference },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.scoped.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        throw new ConflictException(
          'A payment request for this phone and amount is already waiting for approval. Ask the customer to approve it, or wait for it to expire and try again.',
        );
      }
      await this.prisma.scoped.payment.update({
        where: { id: payment.id },
        data: { providerRef: res.reference },
      });
      return { paymentId: payment.id, orderReference, status: res.status };
    } catch (e) {
      // The push definitively did not go out (4xx) — don't leave a phantom
      // PENDING payment. On an ambiguous network failure keep it: the
      // reconcile poller resolves it through the idempotent order reference.
      if (e instanceof SnippeRejectedError) {
        await this.prisma.scoped.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        });
        throw new BadRequestException(`Payment rejected: ${e.message}`);
      }
      throw e;
    }
  }

  /** Webhook URL for Snippe — HTTPS only, so unset on a local machine. */
  private webhookUrl(): string | undefined {
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, '');
    return base?.startsWith('https://')
      ? `${base}/v1/webhooks/snippe`
      : undefined;
  }

  /**
   * Resolve a PENDING Snippe payment against Snippe's own record. Used by the
   * webhook (so a forged body can't confirm anything) and by the poller.
   */
  async syncSnippePayment(snippe: SnippePayment, raw: Prisma.InputJsonValue) {
    const outcome = SnippeService.paymentOutcome(snippe.status);
    if (outcome === 'pending') return 'ignored' as const;
    const orderReference =
      typeof snippe.metadata?.order_reference === 'string'
        ? snippe.metadata.order_reference
        : undefined;
    return this.confirmFromWebhook(
      { orderReference, providerRef: snippe.reference },
      outcome,
      raw,
      snippe,
    );
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
    lookup: { orderReference?: string; providerRef?: string },
    outcome: 'received' | 'failed' | 'reversed',
    raw: Prisma.InputJsonValue,
    snippe?: SnippePayment,
  ): Promise<'applied' | 'reversed' | 'duplicate' | 'unmatched' | 'failed'> {
    // Unscoped lookup (no tenant context on a public webhook).
    const or: Prisma.PaymentWhereInput[] = [];
    if (lookup.providerRef) or.push({ providerRef: lookup.providerRef });
    if (lookup.orderReference) {
      or.push({ orderReference: lookup.orderReference });
    }
    if (or.length === 0) return 'unmatched';
    const payment = await this.prisma.payment.findFirst({ where: { OR: or } });
    if (!payment) return 'unmatched';
    const providerRef = lookup.providerRef;

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

    // What Snippe actually settled to us (after its collection fee) is what we
    // owe onward to the seller. Fall back to the full amount if not reported.
    const gross = Number(payment.amount);
    const net = snippe?.settlement?.net?.value ?? gross;
    await this.prisma.scoped.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CONFIRMED,
        providerRef: providerRef ?? payment.providerRef,
        method: this.mapChannel(snippe?.channel?.provider) ?? payment.method,
        netAmount: net,
        feeAmount: Math.max(0, gross - net),
        rawPayload: raw,
      },
    });
    await this.recompute(payment.loanId);
    await this.settleDeviceState(payment.loanId);
    await this.notifyCollections(
      payment.loanId,
      payment.id,
      Number(payment.amount),
    );
    // We don't hold cash: pass the money on to the seller as soon as it clears.
    // Best-effort — failures are retried by the payouts sweep.
    this.payouts.disburseTenant(payment.tenantId).catch((e) =>
      this.logger.warn(
        `Payout for tenant ${payment.tenantId} failed: ${(e as Error).message}`,
      ),
    );
    return 'applied';
  }

  /** Map a Snippe channel provider (e.g. "airtel", "mpesa", "mixx") to our PaymentMethod. */
  private mapChannel(provider?: string): PaymentMethod | undefined {
    if (!provider) return undefined;
    const c = provider.toUpperCase();
    if (c.includes('MPESA') || c.includes('M-PESA') || c.includes('VODACOM')) {
      return PaymentMethod.MPESA;
    }
    if (c.includes('TIGO') || c.includes('MIXX') || c.includes('YAS')) {
      return PaymentMethod.TIGOPESA;
    }
    if (c.includes('AIRTEL')) return PaymentMethod.AIRTELMONEY;
    if (c.includes('CARD')) return PaymentMethod.CARD;
    return undefined;
  }

  /** Apply a confirmed payment: rebuild allocations, then settle/unlock. */
  private async applyConfirmed(paymentId: string) {
    const payment = await this.prisma.scoped.payment.findFirst({
      where: { id: paymentId },
      select: { id: true, loanId: true, amount: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.recompute(payment.loanId);
    await this.settleDeviceState(payment.loanId);
    await this.notifyCollections(payment.loanId, payment.id, Number(payment.amount));
  }

  private async notifyCollections(
    loanId: string,
    paymentId: string,
    amount: number,
  ) {
    try {
      await this.collections.onPaymentConfirmed(loanId, paymentId, amount);
    } catch (e) {
      this.logger.warn(
        `Collections hook failed for loan ${loanId}: ${(e as Error).message}`,
      );
    }
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
