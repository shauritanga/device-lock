-- Guardians (3 per customer, enforced when a loan is created).
CREATE TABLE "Guardian" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "idDocumentType" "IdDocumentType" NOT NULL,
  "nationalId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "photoUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Guardian_tenantId_idx" ON "Guardian"("tenantId");
CREATE INDEX "Guardian_customerId_idx" ON "Guardian"("customerId");

ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Guardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guardian" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Guardian" USING ("tenantId" = app_current_tenant());
CREATE POLICY tenant_insert ON "Guardian" FOR INSERT WITH CHECK ("tenantId" = app_current_tenant());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Guardian" TO devicelock_app;
