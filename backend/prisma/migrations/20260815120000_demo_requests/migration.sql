-- CreateEnum
CREATE TYPE "DemoRequestStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'CLOSED');

-- CreateTable
CREATE TABLE "DemoRequest" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "devicesPerMonth" TEXT,
    "suggestedPackage" TEXT,
    "message" TEXT,
    "status" "DemoRequestStatus" NOT NULL DEFAULT 'NEW',
    "adminNotes" TEXT,
    "convertedTenantId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contactedAt" TIMESTAMP(3),

    CONSTRAINT "DemoRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DemoRequest_status_createdAt_idx" ON "DemoRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DemoRequest_phone_idx" ON "DemoRequest"("phone");

-- AddForeignKey
ALTER TABLE "DemoRequest" ADD CONSTRAINT "DemoRequest_convertedTenantId_fkey" FOREIGN KEY ("convertedTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
