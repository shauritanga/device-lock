-- AlterTable
ALTER TABLE "CollectionCase" ADD COLUMN     "referralNote" TEXT,
ADD COLUMN     "referredAt" TIMESTAMP(3),
ADD COLUMN     "referredById" TEXT;

-- AddForeignKey
ALTER TABLE "CollectionCase" ADD CONSTRAINT "CollectionCase_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
