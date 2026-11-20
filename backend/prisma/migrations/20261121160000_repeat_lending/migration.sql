-- Repeat lending: keep a repaid phone enrolled instead of releasing it.
CREATE TYPE "AfterRepayment" AS ENUM ('RELEASE', 'KEEP_ENROLLED');

ALTER TABLE "Tenant"
  ADD COLUMN "afterRepayment" "AfterRepayment" NOT NULL DEFAULT 'RELEASE',
  ADD COLUMN "retentionDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "Device" ADD COLUMN "dormantSince" TIMESTAMP(3);

ALTER TYPE "CommandType" ADD VALUE IF NOT EXISTS 'RELAX';
ALTER TYPE "CommandType" ADD VALUE IF NOT EXISTS 'ARM';
