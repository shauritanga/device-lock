-- Sales agents and phone stock: a registered phone can be allocated to an agent,
-- and every loan records who sold it.
ALTER TABLE "Device" ADD COLUMN "assignedAgentId" TEXT;
ALTER TABLE "Loan" ADD COLUMN "soldById" TEXT;

CREATE INDEX "Device_assignedAgentId_idx" ON "Device"("assignedAgentId");
CREATE INDEX "Loan_soldById_idx" ON "Loan"("soldById");

ALTER TABLE "Device" ADD CONSTRAINT "Device_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_soldById_fkey"
  FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
