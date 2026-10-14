-- Passport as an ID document type
ALTER TYPE "IdDocumentType" ADD VALUE IF NOT EXISTS 'PASSPORT';

-- Installment frequency
CREATE TYPE "PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

ALTER TABLE "Loan"
  ADD COLUMN "frequency" "PaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN "termPeriods" INTEGER NOT NULL DEFAULT 0;

UPDATE "Loan" SET "termPeriods" = "termMonths";

-- Last-known device location
ALTER TABLE "Device"
  ADD COLUMN "lastLat" DOUBLE PRECISION,
  ADD COLUMN "lastLng" DOUBLE PRECISION,
  ADD COLUMN "lastLocationAccuracy" DOUBLE PRECISION,
  ADD COLUMN "lastLocationAt" TIMESTAMP(3);
