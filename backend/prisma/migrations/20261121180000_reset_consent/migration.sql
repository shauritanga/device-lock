-- Record that the customer agreed to a factory reset of their own phone.
ALTER TABLE "Customer"
  ADD COLUMN "resetConsentAt" TIMESTAMP(3),
  ADD COLUMN "resetConsentById" TEXT;
