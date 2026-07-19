import { CollectionsPackage } from '@prisma/client';

export type PackageDef = {
  code: CollectionsPackage;
  label: string;
  deviceBandMin: number;
  /** Inclusive upper bound; Starter is exclusive at max (devices < 30). */
  deviceBandMax: number;
  priceModel: 'PER_DEVICE' | 'FLAT';
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
