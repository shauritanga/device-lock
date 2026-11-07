import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CollectionsInvoiceStatus,
  CollectionsPackage,
  CollectionsSubscriptionStatus,
  DeviceStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type AccessReason =
  | 'OK'
  | 'EXEMPT'
  | 'NO_SUBSCRIPTION'
  | 'AWAITING_ACTIVATION'
  | 'AWAITING_FIRST_PAYMENT'
  | 'PAYMENT_OVERDUE'
  | 'SUSPENDED';

export interface AccessState {
  /** False = read-only: the company can look but not register phones, sell, etc. */
  allowed: boolean;
  reason: AccessReason;
  message: string;
  packageCode: CollectionsPackage | null;
  /** Negotiation clients don't sell phones, whether or not they've paid. */
  noPhones: boolean;
  /** Phones the package covers (null = no cap). */
  phoneAllowance: number | null;
  /** The invoice that must be paid to unlock, when there is one. */
  invoice: { id: string; total: number; dueDate: Date; status: string } | null;
}

const CACHE_MS = 5_000;
const DAY_MS = 86_400_000;

/**
 * Decides whether a company may work. A company that must pay (see
 * `Tenant.subscriptionRequired`) is read-only until its package's first
 * invoice is paid, and again if a later invoice stays unpaid past a grace
 * period. Companies that existed before this rule are exempt.
 */
@Injectable()
export class SubscriptionAccessService {
  private readonly cache = new Map<string, { at: number; state: AccessState }>();
  private readonly graceDays: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.graceDays = Number(config.get('SUBSCRIPTION_GRACE_DAYS') ?? 7);
  }

  /** Drop the cached answer after an invoice or subscription changes. */
  invalidate(tenantId?: string) {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }

  async check(tenantId: string): Promise<AccessState> {
    const hit = this.cache.get(tenantId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.state;
    const state = await this.compute(tenantId);
    this.cache.set(tenantId, { at: Date.now(), state });
    return state;
  }

  private async compute(tenantId: string): Promise<AccessState> {
    const [tenant, sub] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { subscriptionRequired: true },
      }),
      this.prisma.collectionsSubscription.findUnique({ where: { tenantId } }),
    ]);

    const base = {
      packageCode: sub?.packageCode ?? null,
      noPhones: sub?.packageCode === CollectionsPackage.NEGOTIATION,
      phoneAllowance: sub?.phoneAllowance ?? null,
      invoice: null as AccessState['invoice'],
    };

    if (!tenant?.subscriptionRequired) {
      return { ...base, allowed: true, reason: 'EXEMPT', message: 'No payment required.' };
    }
    if (!sub) {
      return {
        ...base,
        allowed: false,
        reason: 'NO_SUBSCRIPTION',
        message: 'Your package has not been set up yet. Contact Linda to get started.',
      };
    }
    if (sub.status === CollectionsSubscriptionStatus.SUSPENDED) {
      return {
        ...base,
        allowed: false,
        reason: 'SUSPENDED',
        message: 'Your subscription is suspended. Contact Linda to restore it.',
      };
    }
    if (sub.status === CollectionsSubscriptionStatus.PENDING) {
      return {
        ...base,
        allowed: false,
        reason: 'AWAITING_ACTIVATION',
        message: 'Your package is being set up. You can start once it is activated and paid.',
      };
    }

    const invoices = await this.prisma.collectionsInvoice.findMany({
      where: { tenantId, status: { not: CollectionsInvoiceStatus.VOID } },
      orderBy: { periodStart: 'asc' },
      select: { id: true, total: true, dueDate: true, status: true },
    });
    const toInvoice = (i: (typeof invoices)[number]) => ({
      id: i.id,
      total: Number(i.total),
      dueDate: i.dueDate,
      status: i.status,
    });

    const hasPaid = invoices.some((i) => i.status === CollectionsInvoiceStatus.PAID);
    if (!hasPaid) {
      const first = invoices[0];
      return {
        ...base,
        allowed: false,
        reason: 'AWAITING_FIRST_PAYMENT',
        message: first
          ? 'Your account unlocks once your first package invoice is paid.'
          : 'Your package invoice is being prepared. Your account unlocks once it is paid.',
        invoice: first ? toInvoice(first) : null,
      };
    }

    const cutoff = Date.now() - this.graceDays * DAY_MS;
    const overdue = invoices.find(
      (i) =>
        (i.status === CollectionsInvoiceStatus.OPEN ||
          i.status === CollectionsInvoiceStatus.PAST_DUE) &&
        i.dueDate.getTime() < cutoff,
    );
    if (overdue) {
      return {
        ...base,
        allowed: false,
        reason: 'PAYMENT_OVERDUE',
        message: 'A package invoice is overdue. Your account unlocks again once it is paid.',
        invoice: toInvoice(overdue),
      };
    }
    return { ...base, allowed: true, reason: 'OK', message: 'Subscription active.' };
  }

  /** A client may only register as many phones as they have paid for. */
  async assertCanRegisterPhone(tenantId: string) {
    const state = await this.check(tenantId);
    if (state.noPhones) {
      throw new ForbiddenException({
        code: 'NEGOTIATION_NO_PHONES',
        message: "The Negotiation package is for lenders that don't sell phones.",
      });
    }
    if (state.phoneAllowance === null) return; // legacy subscription: no cap
    const inUse = await this.prisma.device.count({
      where: {
        tenantId,
        status: { notIn: [DeviceStatus.RELEASED, DeviceStatus.WIPED] },
      },
    });
    if (inUse >= state.phoneAllowance) {
      throw new ForbiddenException({
        code: 'PHONE_LIMIT_REACHED',
        message: `Your package covers ${state.phoneAllowance} phones and you have ${inUse}. Contact Linda to add more.`,
      });
    }
  }
}
