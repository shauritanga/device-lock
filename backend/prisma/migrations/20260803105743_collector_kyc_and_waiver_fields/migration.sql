-- AlterTable
ALTER TABLE "CollectionCase" ADD COLUMN     "extensionApplied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalOverdueAmount" DECIMAL(14,2),
ADD COLUMN     "penaltyInterestAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "penaltyInterestReductionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waiverValidUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "employerName" TEXT,
ADD COLUMN     "employerPhone" TEXT,
ADD COLUMN     "idCardPhotoUrl" TEXT,
ADD COLUMN     "monthlyIncome" DECIMAL(14,2),
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "selfiePhotoUrl" TEXT;
