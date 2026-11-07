import { CollectionsPackage } from '@prisma/client';

export type PackageDef = {
  code: CollectionsPackage;
  label: string;
  deviceBandMin: number;
  /** Inclusive upper bound; Starter is exclusive at max (devices < 30). */
  deviceBandMax: number;
  priceModel: 'PER_DEVICE' | 'FLAT' | 'CUSTOM';
  unitPrice: number | null;
  flatPrice: number | null;
  currency: string;
};

/**
 * Managed collections packages (seller pays platform for follow-up labour).
 * Keep in sync with docs/COLLECTIONS_CALL_CENTRE_PLAN.md.
 */
export const COLLECTIONS_PACKAGES: Record<CollectionsPackage, PackageDef> = {
  STARTER: {
    code: CollectionsPackage.STARTER,
    label: 'Starter',
    deviceBandMin: 1,
    deviceBandMax: 29,
    priceModel: 'PER_DEVICE',
    unitPrice: 18_000,
    flatPrice: null,
    currency: 'TZS',
  },
  GROWTH: {
    code: CollectionsPackage.GROWTH,
    label: 'Growth',
    deviceBandMin: 30,
    deviceBandMax: 44,
    priceModel: 'FLAT',
    unitPrice: null,
    flatPrice: 700_000,
    currency: 'TZS',
  },
  BUSINESS: {
    code: CollectionsPackage.BUSINESS,
    label: 'Business',
    deviceBandMin: 45,
    deviceBandMax: 55,
    priceModel: 'FLAT',
    unitPrice: null,
    flatPrice: 900_000,
    currency: 'TZS',
  },
  NEGOTIATION: {
    code: CollectionsPackage.NEGOTIATION,
    label: 'Negotiation',
    // No phones: this package is for lenders (e.g. microcredit) who don't sell
    // devices. The monthly fee is agreed with each client, so there is no list price.
    deviceBandMin: 0,
    deviceBandMax: 0,
    priceModel: 'CUSTOM',
    unitPrice: null,
    flatPrice: null,
    currency: 'TZS',
  },
};

export function packageForDeviceCount(count: number): PackageDef | null {
  if (count >= 1 && count <= 29) return COLLECTIONS_PACKAGES.STARTER;
  if (count >= 30 && count <= 44) return COLLECTIONS_PACKAGES.GROWTH;
  if (count >= 45 && count <= 55) return COLLECTIONS_PACKAGES.BUSINESS;
  return null;
}

export function isPackageValidForCount(code: CollectionsPackage, count: number): boolean {
  const p = COLLECTIONS_PACKAGES[code];
  return count >= p.deviceBandMin && count <= p.deviceBandMax;
}

export function monthlyPrice(code: CollectionsPackage, activeDevices: number): number {
  const p = COLLECTIONS_PACKAGES[code];
  if (p.priceModel === 'PER_DEVICE') {
    return (p.unitPrice ?? 0) * activeDevices;
  }
  return p.flatPrice ?? 0;
}

/** What a subscription snapshot needs to price a month. */
export type PricedSubscription = {
  packageCode: CollectionsPackage;
  priceModel: string;
  unitPrice: unknown;
  flatPrice: unknown;
  phoneAllowance?: number | null;
};

/**
 * Monthly cost of a subscription as contracted:
 *  - NEGOTIATION / CUSTOM: the agreed flat fee,
 *  - per-device (Starter): unit price x the phones prepaid for (falls back to
 *    phones in use for legacy subscriptions with no allowance),
 *  - flat bands: the flat price.
 */
export function subscriptionMonthly(sub: PricedSubscription, activeDevices: number): number {
  if (sub.priceModel === 'CUSTOM') return Number(sub.flatPrice ?? 0);
  if (sub.priceModel === 'PER_DEVICE') {
    return Number(sub.unitPrice ?? 0) * (sub.phoneAllowance ?? activeDevices);
  }
  return Number(sub.flatPrice ?? 0);
}

/** Phones a package lets a client register; null = no cap (legacy). */
export function allowanceFor(code: CollectionsPackage, requested?: number | null): number {
  if (code === CollectionsPackage.NEGOTIATION) return 0;
  const p = COLLECTIONS_PACKAGES[code];
  if (p.priceModel === 'PER_DEVICE') return requested ?? 0;
  return p.deviceBandMax;
}
