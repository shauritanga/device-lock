-- Contract / consent records for financed phone sales.
CREATE TABLE "Contract" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedBy" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'en',
  "termsVersion" TEXT NOT NULL DEFAULT 'simulinda-v1',
  "termsText" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Contract_loanId_key" ON "Contract"("loanId");
CREATE INDEX "Contract_tenantId_acceptedAt_idx" ON "Contract"("tenantId", "acceptedAt");
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Contract" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contract" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Contract" USING ("tenantId" = app_current_tenant());
CREATE POLICY tenant_insert ON "Contract" FOR INSERT WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Contract" TO devicelock_app;
