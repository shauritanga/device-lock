-- Who registered the customer, so a sales agent sees only their own customers.
ALTER TABLE "Customer" ADD COLUMN "createdById" TEXT;

-- Customers already sold to by an agent belong to that agent.
UPDATE "Customer" c
SET "createdById" = l."soldById"
FROM (
  SELECT DISTINCT ON ("customerId") "customerId", "soldById"
  FROM "Loan"
  WHERE "soldById" IS NOT NULL
  ORDER BY "customerId", "startDate" ASC
) l
WHERE l."customerId" = c."id";
