ALTER TABLE "Tenant" ADD COLUMN "lockOnSimChange" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Device" ADD COLUMN "simIccid" TEXT;
ALTER TABLE "Device" ADD COLUMN "simOperator" TEXT;
ALTER TABLE "Device" ADD COLUMN "simCountryIso" TEXT;
ALTER TABLE "Device" ADD COLUMN "simPhoneNumber" TEXT;
ALTER TABLE "Device" ADD COLUMN "simFingerprint" TEXT;
ALTER TABLE "Device" ADD COLUMN "approvedSimFingerprint" TEXT;
ALTER TABLE "Device" ADD COLUMN "simLastChangedAt" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN "simChangeApprovedAt" TIMESTAMP(3);
