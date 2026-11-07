-- Partner API sync: the id a record has in the partner's own system.
ALTER TABLE "Customer" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Device" ADD COLUMN "externalId" TEXT;

-- NULLs are distinct in Postgres, so records created without an external id never clash.
CREATE UNIQUE INDEX "Customer_tenantId_externalId_key" ON "Customer"("tenantId", "externalId");
CREATE UNIQUE INDEX "Device_tenantId_externalId_key" ON "Device"("tenantId", "externalId");
