-- AlterEnum
ALTER TYPE "CollectionsPackage" ADD VALUE 'NEGOTIATION';

-- AlterTable
ALTER TABLE "CollectionsSubscription" ADD COLUMN     "phoneAllowance" INTEGER;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "subscriptionRequired" BOOLEAN NOT NULL DEFAULT true;

-- Companies that already exist keep working without a paid package; the
-- payment gate applies to companies created from now on (admins can switch it
-- on per company).
UPDATE "Tenant" SET "subscriptionRequired" = false;
