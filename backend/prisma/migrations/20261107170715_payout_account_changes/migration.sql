-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "payoutHoldUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PayoutAccountChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT NOT NULL,
    "changedByRole" TEXT NOT NULL,
    "oldPhone" TEXT,
    "oldName" TEXT,
    "newPhone" TEXT NOT NULL,
    "newName" TEXT NOT NULL,
    "holdUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAccountChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayoutAccountChange_tenantId_createdAt_idx" ON "PayoutAccountChange"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "PayoutAccountChange" ADD CONSTRAINT "PayoutAccountChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation for the audit table.
ALTER TABLE "PayoutAccountChange" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayoutAccountChange" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayoutAccountChange" USING ("tenantId" = app_current_tenant());
CREATE POLICY tenant_insert ON "PayoutAccountChange" FOR INSERT WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "PayoutAccountChange" TO devicelock_app;
