-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'NEEDS_REVIEW', 'FAILED');

-- AlterTable
ALTER TABLE "Customer"
  ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "faceDistance" DOUBLE PRECISION,
  ADD COLUMN "livenessPassed" BOOLEAN,
  ADD COLUMN "verificationChecks" JSONB,
  ADD COLUMN "verifiedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedById" TEXT,
  ADD COLUMN "verificationNotes" TEXT;
