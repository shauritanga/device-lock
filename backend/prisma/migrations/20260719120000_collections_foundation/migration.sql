-- Phase 1: Managed collections foundation
-- Roles, subscription, collection cases, collector phone

-- AlterEnum UserRole (idempotent)
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'COLLECTIONS_ADMIN';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE "UserRole" ADD VALUE 'COLLECTOR';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
CREATE TYPE "CollectionsPackage" AS ENUM ('STARTER', 'GROWTH', 'BUSINESS');
CREATE TYPE "CollectionsSubscriptionStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED');
CREATE TYPE "CollectionCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PROMISED', 'PAID', 'ESCALATED', 'CLOSED');
CREATE TYPE "CollectionCaseSource" AS ENUM ('AUTO_OVERDUE', 'MANUAL', 'SELLER_HANDOFF');

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- CreateTable CollectionsSubscription
CREATE TABLE "CollectionsSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "packageCode" "CollectionsPackage" NOT NULL,
    "status" "CollectionsSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "deviceBandMin" INTEGER NOT NULL,
    "deviceBandMax" INTEGER NOT NULL,
    "priceModel" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2),
    "flatPrice" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionsSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable CollectionCase
CREATE TABLE "CollectionCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "installmentId" TEXT,
    "status" "CollectionCaseStatus" NOT NULL DEFAULT 'OPEN',
    "source" "CollectionCaseSource" NOT NULL DEFAULT 'AUTO_OVERDUE',
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "amountDue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TZS',
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionsSubscription_tenantId_key" ON "CollectionsSubscription"("tenantId");
CREATE INDEX "CollectionsSubscription_status_idx" ON "CollectionsSubscription"("status");

CREATE UNIQUE INDEX "CollectionCase_loanId_key" ON "CollectionCase"("loanId");
CREATE INDEX "CollectionCase_tenantId_status_idx" ON "CollectionCase"("tenantId", "status");
CREATE INDEX "CollectionCase_assignedToId_status_idx" ON "CollectionCase"("assignedToId", "status");
CREATE INDEX "CollectionCase_status_daysOverdue_idx" ON "CollectionCase"("status", "daysOverdue");
CREATE INDEX "CollectionCase_nextActionAt_idx" ON "CollectionCase"("nextActionAt");
CREATE INDEX "User_role_idx" ON "User"("role");

ALTER TABLE "CollectionsSubscription" ADD CONSTRAINT "CollectionsSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionsSubscription" ADD CONSTRAINT "CollectionsSubscription_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
