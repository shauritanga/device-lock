export type TabId = 'overview' | 'billing' | 'payouts' | 'agreement';

export type PackageDef = {
  code: string;
  label: string;
  deviceBandMin: number;
  deviceBandMax: number;
  priceModel: string;
  unitPrice: number | null;
  flatPrice: number | null;
  currency: string;
};

export type Tenant = {
  id: string;
  name: string;
  country?: string;
  isActive?: boolean;
  createdAt?: string;
};

export type Invoice = {
  id: string;
  periodStart: string;
  periodEnd: string;
  packageCode: string;
  activeDevices: number;
  total: string | number;
  status: string;
  dueDate: string;
  paidAt?: string | null;
  tenant: { name: string };
};

export type BillingSummary = {
  subscription: {
    id: string;
    packageCode: string;
    status: string;
    notes?: string | null;
    activatedAt?: string | null;
  } | null;
  activeDevices: number;
  suggestedPackage: string | null;
  estimatedMonthly: number | null;
  openBalance: number;
  invoices: Invoice[];
};

/** Plain-language state of the service agreement, for the overview. */
export const AGREEMENT_COPY: Record<string, { label: string; hint: string }> = {
  NONE: { label: 'Not started', hint: 'No agreement has been prepared yet.' },
  DRAFT: { label: 'Draft', hint: 'Prepared but not sent to the client.' },
  SENT: { label: 'Sent', hint: 'Waiting for the client to sign.' },
  CLIENT_SIGNED: { label: 'Client signed', hint: 'Waiting for your countersignature.' },
  ACTIVE: { label: 'Active', hint: 'Fully signed — devices can be enrolled.' },
  VOID: { label: 'Void', hint: 'This agreement was cancelled.' },
};
