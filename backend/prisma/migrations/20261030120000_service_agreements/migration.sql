-- Service agreement between the platform operator and a client company.
CREATE TYPE "AgreementStatus" AS ENUM ('DRAFT', 'SENT', 'CLIENT_SIGNED', 'ACTIVE', 'VOID');

CREATE TABLE "ServiceAgreement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "status" "AgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "termsVersion" TEXT NOT NULL DEFAULT 'service-agreement-v1',
  "content" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "feePerDevice" INTEGER NOT NULL DEFAULT 5000,
  "providerName" TEXT NOT NULL,
  "providerAddress" TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  "clientAddress" TEXT NOT NULL,
  "clientEmail" TEXT NOT NULL,
  "clientPhone" TEXT,
  "providerEmail" TEXT,
  "providerPhone" TEXT,
  "sentAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdById" TEXT,
  "clientSignatoryName" TEXT,
  "clientSignatoryTitle" TEXT,
  "clientSignature" TEXT,
  "clientSignedAt" TIMESTAMP(3),
  "clientSignedById" TEXT,
  "clientSignedIp" TEXT,
  "clientSignedAgent" TEXT,
  "clientWitnessName" TEXT,
  "clientWitnessSignature" TEXT,
  "providerSignatoryName" TEXT,
  "providerSignatoryTitle" TEXT,
  "providerSignature" TEXT,
  "providerSignedAt" TIMESTAMP(3),
  "providerSignedById" TEXT,
  "providerWitnessName" TEXT,
  "providerWitnessSignature" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceAgreement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceAgreement_tenantId_createdAt_idx" ON "ServiceAgreement"("tenantId", "createdAt");
CREATE INDEX "ServiceAgreement_status_idx" ON "ServiceAgreement"("status");

ALTER TABLE "ServiceAgreement" ADD CONSTRAINT "ServiceAgreement_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "ServiceAgreement" TO devicelock_app;
