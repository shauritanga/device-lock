-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MASTER_COLLECTOR';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "managedById" TEXT;

-- CreateIndex
CREATE INDEX "User_managedById_idx" ON "User"("managedById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managedById_fkey" FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
