-- Phase 5: Collections package monthly invoices

CREATE TYPE "CollectionsInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'PAST_DUE');

CREATE TABLE "CollectionsInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "packageCode" "CollectionsPackage" NOT NULL,
    "activeDevices" INTEGER NOT NULL,
    "priceModel" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2),
    "flatPrice" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "CollectionsInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "lineItems" JSONB NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CollectionsInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionsInvoice_subscriptionId_periodStart_key" ON "CollectionsInvoice"("subscriptionId", "periodStart");
CREATE INDEX "CollectionsInvoice_tenantId_periodStart_idx" ON "CollectionsInvoice"("tenantId", "periodStart");
CREATE INDEX "CollectionsInvoice_status_dueDate_idx" ON "CollectionsInvoice"("status", "dueDate");

ALTER TABLE "CollectionsInvoice" ADD CONSTRAINT "CollectionsInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionsInvoice" ADD CONSTRAINT "CollectionsInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "CollectionsSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
