-- Enrolled phones are sent to the call centre automatically, without waiting for an overdue payment.
ALTER TYPE "CollectionCaseStatus" ADD VALUE IF NOT EXISTS 'MONITORING';
ALTER TYPE "CollectionCaseSource" ADD VALUE IF NOT EXISTS 'AUTO_ENROLLED';
