-- AlterEnum
CREATE TYPE "IdDocumentType" AS ENUM ('NATIONAL_ID', 'VOTER_ID', 'DRIVING_LICENSE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "idDocumentType" "IdDocumentType";
