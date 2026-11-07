import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus, PayoutStatus, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../common/prisma/prisma.service';
import { TENANT_ID_KEY } from '../common/tenant/tenant-context';
import {
  SNIPPE_MIN_PAYOUT,
  SnippePayout,
  SnippeRejectedError,
  SnippeService,
} from '../integrations/snippe/snippe.service';

/** Snippe keeps idempotency keys for 24h; stop retrying a send well before. */
const RETRY_WINDOW_MS = 20 * 60 * 60 * 1000;

/**
 * Passes collected instalments on to the seller (the phone owner).
 *
 * We never hold cash: every Snippe-collected payment that clears is owed, net
 * of Snippe's collection fee, to its tenant. Payments are claimed into a Payout
 * row atomically (payoutId IS NULL -> set) before any money is sent, so a
 * payment can never be paid out twice. The payout fee is deducted from the
 * seller's share, so the platform ends up holding nothing.
 */
@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly snippe: SnippeService,
    private readonly cls: ClsService,
  ) {}

  /** Cleared, not-yet-disbursed Snippe payments for a tenant. */
  private owedPayments(tenantId: string) {
    return this.prisma.payment.findMany({
      where: {
        tenantId,
        provider: 'SNIPPE',
        status: PaymentStatus.CONFIRMED,
        payoutId: null,
        netAmount: { not: null },
      },
      select: { id: true, netAmount: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Tenants that currently have money waiting to be passed on. */
  async tenantsWithBalance(): Promise<string[]> {
    const rows = await this.prisma.payment.groupBy({
      by: ['tenantId'],
      where: {
        provider: 'SNIPPE',
        status: PaymentStatus.CONFIRMED,
        payoutId: null,
        netAmount: { not: null },
      },
    });
    return rows.map((r) => r.tenantId);
  }

  /**
   * Disburse everything currently owed to a tenant, if it clears Snippe's
   * minimum. Returns the payout, or why nothing was sent.
   */
  async disburseTenant(
    tenantId: string,
  ): Promise<{ payoutId?: string; skipped?: string }> {
    if (!this.snippe.configured) return { skipped: 'snippe_not_configured' };
    if (this.running.has(tenantId)) return { skipped: 'already_running' };
    this.running.add(tenantId);
    try {
      return await this.disburse(tenantId);
    } finally {
      this.running.delete(tenantId);
    }
  }

  private async disburse(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, payoutPhone: true, payoutName: true },
    });
    if (!tenant?.payoutPhone || !tenant.payoutName) {
      this.logger.warn(
        `Tenant ${tenantId} has no payout account; funds stay queued`,
      );
      return { skipped: 'no_payout_account' };
    }

    const owed = await this.owedPayments(tenantId);
    const gross = owed.reduce((sum, p) => sum + Number(p.netAmount), 0);
    // Snippe takes whole shillings; round down so we never promise more than we hold.
    const grossWhole = Math.floor(gross);
    if (grossWhole < SNIPPE_MIN_PAYOUT) return { skipped: 'below_minimum' };

    // Fee is charged on top of the amount, so size the payout so that
    // amount + fee == what we hold. Fee can be tiered, so confirm it once more.
    let fee = Math.ceil(await this.snippe.getPayoutFee(grossWhole));
    let amount = grossWhole - fee;
    if (amount >= SNIPPE_MIN_PAYOUT) {
      const fee2 = Math.ceil(await this.snippe.getPayoutFee(amount));
      if (fee2 > fee) {
        fee = fee2;
        amount = grossWhole - fee;
      }
    }
    if (amount < SNIPPE_MIN_PAYOUT) return { skipped: 'below_minimum' };

    // Claim the payments. updateMany with payoutId:null is the atomic guard.
    const ids = owed.map((p) => p.id);
    const payout = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: {
          tenantId,
          amount,
          feeAmount: fee,
          grossAmount: grossWhole,
          recipientPhone: tenant.payoutPhone!,
          recipientName: tenant.payoutName!,
        },
      });
      const claimed = await tx.payment.updateMany({
        where: { id: { in: ids }, payoutId: null },
        data: { payoutId: created.id },
      });
      if (claimed.count !== ids.length) {
        throw new Error('Payments changed while claiming; will retry');
      }
      return created;
    });

    await this.send(payout.id);
    return { payoutId: payout.id };
  }

  /** Idempotency key: payout id without dashes, within Snippe's 30-char key limit. */
  private keyFor(payoutId: string) {
    return payoutId.replace(/-/g, '').slice(0, 30);
  }

  /** Send (or re-send, idempotently) a claimed payout to Snippe. */
  private async send(payoutId: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout || payout.status !== PayoutStatus.PENDING || payout.providerRef) {
      return;
    }
    try {
      const res = await this.snippe.createPayout({
        amount: Number(payout.amount),
        phone: payout.recipientPhone,
        name: payout.recipientName,
        narration: 'Linda instalment collections',
        idempotencyKey: this.keyFor(payout.id),
        metadata: { payout_id: payout.id, tenant_id: payout.tenantId },
      });
      await this.apply(payout.id, res, res as unknown as Prisma.InputJsonValue);
    } catch (e) {
      if (e instanceof SnippeRejectedError) {
        // Definitively not sent (validation, balance, auth): free the payments
        // so the next sweep can try again once the cause is fixed.
        this.logger.error(`Payout ${payout.id} rejected: ${e.message}`);
        await this.fail(payout.id, PayoutStatus.FAILED, e.message, true);
        return;
      }
      // Outcome unknown (timeout / 5xx). Keep the payments claimed: re-sending
      // with the same idempotency key is safe, and releasing them is not.
      this.logger.warn(
        `Payout ${payout.id} send outcome unknown: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Apply Snippe's view of a payout (from a webhook or a status poll). Safe to
   * call repeatedly; terminal states are never overwritten.
   */
  async apply(
    payoutId: string,
    snippe: SnippePayout,
    raw: Prisma.InputJsonValue,
  ) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      select: { status: true },
    });
    if (!payout) return;
    // A COMPLETED payout can still be reversed; nothing else leaves a terminal
    // state (a late "completed" must not resurrect payments we already released).
    const terminal =
      payout.status === PayoutStatus.REVERSED ||
      payout.status === PayoutStatus.FAILED ||
      (payout.status === PayoutStatus.COMPLETED &&
        snippe.status !== 'reversed');
    if (terminal) return;

    switch (snippe.status) {
      case 'completed':
        await this.prisma.payout.update({
          where: { id: payoutId },
          data: {
            status: PayoutStatus.COMPLETED,
            providerRef: snippe.reference,
            completedAt: new Date(),
            failureReason: null,
            rawPayload: raw,
          },
        });
        this.logger.log(`Payout ${payoutId} completed`);
        break;
      case 'failed':
        await this.fail(
          payoutId,
          PayoutStatus.FAILED,
          snippe.failure_reason ?? 'Payout failed',
          true,
          snippe.reference,
          raw,
        );
        break;
      case 'reversed':
        await this.fail(
          payoutId,
          PayoutStatus.REVERSED,
          snippe.failure_reason ?? 'Payout reversed',
          true,
          snippe.reference,
          raw,
        );
        break;
      default:
        await this.prisma.payout.update({
          where: { id: payoutId },
          data: { providerRef: snippe.reference, rawPayload: raw },
        });
    }
  }

  /** Mark a payout dead and (optionally) put its payments back in the owed pool. */
  private async fail(
    payoutId: string,
    status: PayoutStatus,
    reason: string,
    release: boolean,
    providerRef?: string,
    raw?: Prisma.InputJsonValue,
  ) {
    await this.prisma.$transaction([
      this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status,
          failureReason: reason.slice(0, 500),
          ...(providerRef ? { providerRef } : {}),
          ...(raw ? { rawPayload: raw } : {}),
        },
      }),
      ...(release
        ? [
            this.prisma.payment.updateMany({
              where: { payoutId },
              data: { payoutId: null },
            }),
          ]
        : []),
    ]);
  }

  /** Webhook entry: look the payout up by Snippe reference. */
  async syncByReference(snippe: SnippePayout, raw: Prisma.InputJsonValue) {
    const payout = await this.prisma.payout.findUnique({
      where: { providerRef: snippe.reference },
      select: { id: true },
    });
    if (!payout) return 'unmatched' as const;
    await this.apply(payout.id, snippe, raw);
    return 'applied' as const;
  }

  /**
   * Periodic safety net: settle in-flight payouts, retry sends whose outcome we
   * never learned, then sweep any tenant that has money waiting.
   */
  async sweep() {
    if (!this.snippe.configured) return;

    const pending = await this.prisma.payout.findMany({
      where: { status: PayoutStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    for (const p of pending) {
      try {
        if (p.providerRef) {
          const res = await this.snippe.getPayout(p.providerRef);
          await this.apply(p.id, res, res as unknown as Prisma.InputJsonValue);
        } else if (Date.now() - p.createdAt.getTime() < RETRY_WINDOW_MS) {
          await this.send(p.id);
        } else {
          // Idempotency key has expired and we never saw an answer: re-sending
          // could pay twice. Park it (payments stay claimed) for a human.
          await this.fail(
            p.id,
            PayoutStatus.FAILED,
            'No confirmation from Snippe within 20h — verify in the Snippe dashboard before retrying',
            false,
          );
        }
      } catch (e) {
        this.logger.warn(`Payout ${p.id} sync failed: ${(e as Error).message}`);
      }
    }

    for (const tenantId of await this.tenantsWithBalance()) {
      try {
        await this.disburseTenant(tenantId);
      } catch (e) {
        this.logger.warn(
          `Sweep for tenant ${tenantId} failed: ${(e as Error).message}`,
        );
      }
    }
  }

  /**
   * Tenant staff are always pinned to their own tenant (from the JWT context);
   * only platform admins, who have none, may choose one via `tenantId`.
   */
  private resolveTenant(requested?: string): string | undefined {
    return this.cls.get<string | undefined>(TENANT_ID_KEY) ?? requested;
  }

  list(requestedTenantId?: string) {
    const tenantId = this.resolveTenant(requestedTenantId);
    return this.prisma.payout.findMany({
      where: tenantId ? { tenantId } : {},
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Where a seller's money goes, and how much is owed / in flight / already paid. */
  async summary(requestedTenantId?: string) {
    const tenantId = this.resolveTenant(requestedTenantId);
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, payoutPhone: true, payoutName: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [owed, byStatus] = await Promise.all([
      this.owedPayments(tenantId),
      this.prisma.payout.groupBy({
        by: ['status'],
        where: { tenantId },
        _sum: { amount: true },
        _count: true,
      }),
    ]);
    const sum = (status: PayoutStatus) =>
      Number(byStatus.find((r) => r.status === status)?._sum.amount ?? 0);
    return {
      tenant,
      gatewayConfigured: this.snippe.configured,
      minimumPayout: SNIPPE_MIN_PAYOUT,
      // Cleared in Snippe, not yet sent to the seller.
      owed: owed.reduce((t, p) => t + Number(p.netAmount), 0),
      owedCount: owed.length,
      inFlight: sum(PayoutStatus.PENDING),
      paidOut: sum(PayoutStatus.COMPLETED),
      failedCount: byStatus.find((r) => r.status === PayoutStatus.FAILED)?._count ?? 0,
    };
  }
}
