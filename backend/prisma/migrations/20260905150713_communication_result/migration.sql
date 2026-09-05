-- CreateEnum
CREATE TYPE "CommunicationResult" AS ENUM ('CONNECTED', 'NOT_CONNECTED', 'REPAYMENT_COMMITTED', 'SUSPECTED_FRAUD', 'OTHER');

-- AlterTable
ALTER TABLE "ContactSession" ADD COLUMN "communicationResult" "CommunicationResult";

-- AlterTable
ALTER TABLE "CommunicationLog" ADD COLUMN "communicationResult" "CommunicationResult";
