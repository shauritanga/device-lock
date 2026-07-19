CREATE TABLE "CallFollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "promiseToPayAt" TIMESTAMP(3),
    "escalationStatus" TEXT NOT NULL DEFAULT 'NONE',
    "nextFollowUpAt" TIMESTAMP(3),
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CallFollowUp_tenantId_calledAt_idx" ON "CallFollowUp"("tenantId", "calledAt");
CREATE INDEX "CallFollowUp_tenantId_escalationStatus_idx" ON "CallFollowUp"("tenantId", "escalationStatus");
CREATE INDEX "CallFollowUp_loanId_calledAt_idx" ON "CallFollowUp"("loanId", "calledAt");

ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallFollowUp" ADD CONSTRAINT "CallFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
