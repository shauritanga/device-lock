CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "followUpId" TEXT,
    "customerId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffPhone" TEXT,
    "customerPhone" TEXT NOT NULL,
    "provider" TEXT,
    "providerCallId" TEXT,
    "providerStatus" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'SELF_REPORTED',
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CallAttempt_tenantId_startedAt_idx" ON "CallAttempt"("tenantId", "startedAt");
CREATE INDEX "CallAttempt_staffId_startedAt_idx" ON "CallAttempt"("staffId", "startedAt");
CREATE INDEX "CallAttempt_loanId_startedAt_idx" ON "CallAttempt"("loanId", "startedAt");
CREATE INDEX "CallAttempt_providerCallId_idx" ON "CallAttempt"("providerCallId");

ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "CallFollowUp"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
