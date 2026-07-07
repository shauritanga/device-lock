export type Role = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'AGENT';

export interface AuthUser {
  userId: string;
  tenantId: string | null;
  role: Role;
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
  overdueInstallments: number;
  collectionsThisMonth: number;
  series: { label: string; amount: number }[];
}
