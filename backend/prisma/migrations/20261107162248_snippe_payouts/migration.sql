-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "feeAmount" DECIMAL(14,2),
ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "payoutId" TEXT,
ADD COLUMN     "provider" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "payoutName" TEXT,
ADD COLUMN     "payoutPhone" TEXT;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(14,2) NOT NULL,
    "feeAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "recipientPhone" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "rawPayload" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_providerRef_key" ON "Payout"("providerRef");

-- CreateIndex
CREATE INDEX "Payout_tenantId_status_idx" ON "Payout"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payment_payoutId_idx" ON "Payment"("payoutId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation for the new Payout table (same policy set as other tenant tables).
ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payout" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payout" USING ("tenantId" = app_current_tenant());
CREATE POLICY tenant_insert ON "Payout" FOR INSERT WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Payout" TO devicelock_app;
