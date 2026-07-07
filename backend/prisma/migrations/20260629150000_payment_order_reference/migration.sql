-- Add ClickPesa matching fields to Payment.
ALTER TABLE "Payment" ADD COLUMN "orderReference" TEXT;
ALTER TABLE "Payment" ADD COLUMN "phoneNumber" TEXT;
CREATE UNIQUE INDEX "Payment_orderReference_key" ON "Payment"("orderReference");
