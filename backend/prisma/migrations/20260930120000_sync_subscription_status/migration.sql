-- Backfill tenant-level platform billing from activated collections
-- subscriptions, so the seller Billing page agrees with the admin console.
-- Tenants without an ACTIVE collections subscription keep their values.
UPDATE "Tenant" t
SET "billingPlan" = s."packageCode"::text,
    "subscriptionStatus" = 'ACTIVE',
    "updatedAt" = NOW()
FROM "CollectionsSubscription" s
WHERE s."tenantId" = t.id
  AND s."status" = 'ACTIVE';
