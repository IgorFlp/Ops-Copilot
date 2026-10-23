import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("alert severity migration safely backfills existing rows", async () => {
  const migration = await readFile(
    new URL("./migrations/001-alert-severity.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /ADD COLUMN IF NOT EXISTS "severity"/);
  assert.match(migration, /WHERE "severity" IS NULL/);
  assert.match(migration, /opspilot-seed-payments-latency/);
  assert.match(migration, /opspilot-seed-checkout-errors/);
  assert.match(migration, /opspilot-seed-orders-queue/);
  assert.match(migration, /ALTER COLUMN "severity" SET NOT NULL/);
  assert.doesNotMatch(migration, /\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i);
});
