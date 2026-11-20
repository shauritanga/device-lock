-- Back of the ID card.
ALTER TABLE "Customer" ADD COLUMN "idCardBackPhotoUrl" TEXT;

-- Short-lived links for verifying a customer on the staff member's phone.
CREATE TABLE "VerificationSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "idFrontAt" TIMESTAMP(3),
  "idBackAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VerificationSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VerificationSession_tokenHash_key" ON "VerificationSession"("tokenHash");
CREATE INDEX "VerificationSession_tenantId_idx" ON "VerificationSession"("tenantId");
CREATE INDEX "VerificationSession_customerId_idx" ON "VerificationSession"("customerId");

ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationSession" ADD CONSTRAINT "VerificationSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation (same policy set as the other tenant tables).
ALTER TABLE "VerificationSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "VerificationSession" USING ("tenantId" = app_current_tenant());
CREATE POLICY tenant_insert ON "VerificationSession" FOR INSERT WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "VerificationSession" TO devicelock_app;
