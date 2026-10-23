DO $$
BEGIN
  CREATE TYPE "enum_alerts_severity" AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE "alerts"
  ADD COLUMN IF NOT EXISTS "severity" "enum_alerts_severity";

UPDATE "alerts"
SET "severity" = 'medium'
WHERE "severity" IS NULL;

UPDATE "alerts"
SET "severity" = 'critical'
WHERE "fixtureKey" IN (
  'opspilot-seed-payments-latency',
  'opspilot-seed-checkout-errors'
);

UPDATE "alerts"
SET "severity" = 'high'
WHERE "fixtureKey" = 'opspilot-seed-orders-queue';

ALTER TABLE "alerts"
  ALTER COLUMN "severity" SET DEFAULT 'medium',
  ALTER COLUMN "severity" SET NOT NULL;
