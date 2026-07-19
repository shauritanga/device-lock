-- Phase 2: Contact sessions, communication log, promise-to-pay

CREATE TYPE "ContactChannel" AS ENUM ('CALL', 'SMS', 'WHATSAPP');
CREATE TYPE "ContactSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED');
CREATE TYPE "ContactVerificationStatus" AS ENUM ('NONE', 'SELF_REPORTED', 'ATTEMPTED', 'DEVICE_LOG_MATCHED', 'PROVIDER_VERIFIED', 'NO_MATCH', 'FAILED');
CREATE TYPE "CommunicationDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "CommunicationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'COMPLETED', 'PENDING_PROOF');
CREATE TYPE "PromiseToPayStatus" AS ENUM ('OPEN', 'KEPT', 'BROKEN', 'CANCELLED');

CREATE TABLE "ContactSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "collectorPhone" TEXT,
    "bodyPreview" TEXT,
    "status" "ContactSessionStatus" NOT NULL DEFAULT 'PENDING',
    "verificationStatus" "ContactVerificationStatus" NOT NULL DEFAULT 'NONE',
    "provider" TEXT,
    "providerRef" TEXT,
    "durationSeconds" INTEGER,
    "deviceMatchMeta" JSONB,
    "launchUrl" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "outcomeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "contactSessionId" TEXT,
    "collectorId" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "CommunicationStatus" NOT NULL DEFAULT 'PENDING_PROOF',
    "verificationStatus" "ContactVerificationStatus" NOT NULL DEFAULT 'NONE',
    "customerPhone" TEXT,
    "body" TEXT,
    "durationSeconds" INTEGER,
    "providerRef" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromiseToPay" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "promisedAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "promisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "PromiseToPayStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdById" TEXT,
    "keptPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromiseToPay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactSession_tenantId_initiatedAt_idx" ON "ContactSession"("tenantId", "initiatedAt");
CREATE INDEX "ContactSession_caseId_initiatedAt_idx" ON "ContactSession"("caseId", "initiatedAt");
CREATE INDEX "ContactSession_collectorId_status_idx" ON "ContactSession"("collectorId", "status");
CREATE INDEX "ContactSession_status_expiresAt_idx" ON "ContactSession"("status", "expiresAt");

CREATE UNIQUE INDEX "CommunicationLog_contactSessionId_key" ON "CommunicationLog"("contactSessionId");
CREATE INDEX "CommunicationLog_tenantId_occurredAt_idx" ON "CommunicationLog"("tenantId", "occurredAt");
CREATE INDEX "CommunicationLog_caseId_occurredAt_idx" ON "CommunicationLog"("caseId", "occurredAt");
CREATE INDEX "CommunicationLog_customerId_occurredAt_idx" ON "CommunicationLog"("customerId", "occurredAt");
CREATE INDEX "CommunicationLog_collectorId_occurredAt_idx" ON "CommunicationLog"("collectorId", "occurredAt");

CREATE INDEX "PromiseToPay_tenantId_dueDate_idx" ON "PromiseToPay"("tenantId", "dueDate");
CREATE INDEX "PromiseToPay_caseId_status_idx" ON "PromiseToPay"("caseId", "status");
CREATE INDEX "PromiseToPay_status_dueDate_idx" ON "PromiseToPay"("status", "dueDate");
CREATE INDEX "PromiseToPay_createdById_idx" ON "PromiseToPay"("createdById");

ALTER TABLE "ContactSession" ADD CONSTRAINT "ContactSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactSession" ADD CONSTRAINT "ContactSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactSession" ADD CONSTRAINT "ContactSession_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_contactSessionId_fkey" FOREIGN KEY ("contactSessionId") REFERENCES "ContactSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "CollectionCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromiseToPay" ADD CONSTRAINT "PromiseToPay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
