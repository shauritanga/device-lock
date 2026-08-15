export type Role =
  | 'SUPER_ADMIN'
  | 'COLLECTIONS_ADMIN'
  | 'MASTER_COLLECTOR'
  | 'COLLECTOR'
  | 'OWNER'
  | 'MANAGER'
  | 'AGENT';

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  role: Role;
  email?: string;
  fullName?: string;
  phone?: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  nationalId?: string | null;
  idDocumentType?: 'NATIONAL_ID' | 'VOTER_ID' | 'DRIVING_LICENSE' | null;
  address?: string | null;
  createdAt: string;
}

export type DeviceStatus =
  | 'PENDING_ENROLLMENT'
  | 'ACTIVE'
  | 'LOCKED'
  | 'RELEASED'
  | 'DEFAULTED'
  | 'WIPED';

export interface Device {
  id: string;
  imei: string;
  make?: string | null;
  model?: string | null;
  status: DeviceStatus;
  customerId?: string | null;
  lastCheckInAt?: string | null;
  lockedAt?: string | null;
  simIccid?: string | null;
  simOperator?: string | null;
  simCountryIso?: string | null;
  simPhoneNumber?: string | null;
  simFingerprint?: string | null;
  approvedSimFingerprint?: string | null;
  simLastChangedAt?: string | null;
  simChangeApprovedAt?: string | null;
  createdAt: string;
  customer?: Customer | null;
  loan?: Loan | null;
  enrollToken?: { token: string; expiresAt: string; consumedAt?: string | null } | null;
  events?: DeviceEvent[];
}

export interface DeviceEvent {
  id: string;
  type: string;
  metadata?: unknown;
  createdAt: string;
}

export interface DeviceCommand {
  id: string;
  type: string;
  status: string;
  reason?: string | null;
  createdAt: string;
}

export interface Installment {
  id: string;
  sequence: number;
  dueDate: string;
  amount: string;
  amountPaid: string;
  status: string;
  paidAt?: string | null;
}

export interface Loan {
  id: string;
  principal: string;
  downPayment: string;
  interestRate: string;
  termMonths: number;
  currency: string;
  status: string;
  startDate: string;
  customer?: Customer;
  device?: Device;
  installments?: Installment[];
  summary?: { financed: string; totalInterest: string; totalRepayable: string };
  contract?: Contract | null;
}

export interface Contract {
  id: string;
  loanId: string;
  customerId: string;
  acceptedAt: string;
  acceptedBy: string;
  language: string;
  termsVersion: string;
  termsText: string;
}

export interface Payment {
  id: string;
  loanId: string;
  amount: string;
  method: string;
  status: string;
  orderReference?: string | null;
  receivedAt: string;
}

export interface StaffUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface DashboardSummary {
  devices: {
    total: number;
    active: number;
    locked: number;
    pending: number;
    released: number;
  };
  customers: number;
  activeLoans: number;
  dueTodayInstallments: number;
  overdueInstallments: number;
  collectionsThisMonth: number;
  overdueAmount: number;
  dueToday: DashboardInstallmentRow[];
  overdueAccounts: DashboardInstallmentRow[];
  lockedDevices: DashboardLockedDevice[];
  series: { label: string; amount: number }[];
}

export interface DashboardInstallmentRow {
  id: string;
  sequence: number;
  dueDate: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  loanId: string;
  customerName?: string | null;
  customerPhone?: string | null;
  deviceId?: string | null;
  deviceImei?: string | null;
  deviceModel?: string | null;
}

export interface DashboardLockedDevice {
  id: string;
  imei: string;
  model?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  lockedAt?: string | null;
  loanStatus?: string | null;
}

export interface CallQueueItem {
  loanId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deviceId: string;
  deviceImei: string;
  deviceModel?: string | null;
  deviceStatus: string;
  currency: string;
  installmentId?: string | null;
  installmentSequence?: number | null;
  dueDate?: string | null;
  amountDue: number;
  daysOverdue: number;
  lastFollowUp?: CallFollowUp | null;
}

export interface CallAttempt {
  id: string;
  followUpId?: string | null;
  loanId: string;
  staffPhone?: string | null;
  customerPhone: string;
  provider?: string | null;
  providerCallId?: string | null;
  providerStatus?: string | null;
  verificationStatus: string;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  startedAt: string;
  endedAt?: string | null;
  customer?: { fullName: string; phone: string };
  staff?: { id: string; fullName: string };
}

export interface CallFollowUp {
  id: string;
  loanId: string;
  outcome: string;
  notes?: string | null;
  promiseToPayAt?: string | null;
  escalationStatus: string;
  nextFollowUpAt?: string | null;
  calledAt: string;
  attempts?: CallAttempt[];
  customer?: { fullName: string; phone: string };
  assignedTo?: { id: string; fullName: string } | null;
  createdBy?: { id: string; fullName: string } | null;
}

export interface CallPerformanceRow {
  staffId?: string | null;
  outcome: string;
  count: number;
  avgDurationSeconds?: number;
}

export interface BillingInvoice {
  id: string;
  periodStart: string;
  periodEnd: string;
  planName: string;
  status: string;
  currency: string;
  activeDevices: number;
  smsCount: number;
  voiceCount: number;
  callCentreCount: number;
  subtotal: string;
  tax: string;
  total: string;
  paidAt?: string | null;
  lineItems: BillingLineItem[];
}

export interface BillingLineItem {
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface BillingSummary {
  tenant: { id: string; name: string; billingPlan: string; subscriptionStatus: string };
  period: { start: string; end: string };
  usage: { activeDevices: number; smsCount: number; voiceCount: number; callCentreCount: number };
  estimate: { lineItems: BillingLineItem[]; subtotal: number; tax: number; total: number; plan: Record<string, unknown> };
  invoices: BillingInvoice[];
}
