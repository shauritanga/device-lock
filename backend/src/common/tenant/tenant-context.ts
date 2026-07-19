/**
 * Keys and helpers for the per-request tenant context held in `nestjs-cls`
 * (AsyncLocalStorage). Set once at the start of a request (from the JWT in
 * Phase 1; manually in tests), then read implicitly by the Prisma extension.
 */
export const TENANT_ID_KEY = 'tenantId';

/**
 * Models that carry a `tenantId` column and must be tenant-scoped.
 * Keep in sync with prisma/schema.prisma. Models NOT listed here
 * (e.g. RefreshToken, which is scoped via its User) are left untouched.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'User',
  'Customer',
  'Device',
  'EnrollmentToken',
  'Loan',
  'Contract',
  'CallFollowUp',
  'CallAttempt',
  'BillingInvoice',
  'Installment',
  'Payment',
  'DeviceCommand',
  'DeviceEvent',
]);
