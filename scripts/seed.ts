import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { serviceFixtures } from "../src/services/service-fixtures.js";
import { SqliteOpsStore } from "../src/store/sqlite-ops-store.js";
import type {
  AlertInput,
  RunbookInput,
} from "../src/store/ops-store.js";

export const alertFixtures: AlertInput[] = [
  {
    fixtureKey: "opspilot-seed-payments-latency",
    service: "payments-api",
    title: "Payment processing latency elevated",
    description: "The 95th percentile payment latency is above threshold.",
    status: "firing",
    severity: "critical",
  },
  {
    fixtureKey: "opspilot-seed-checkout-errors",
    service: "checkout-api",
    title: "Checkout error rate elevated",
    description: "Checkout failures exceeded the recent baseline.",
    status: "firing",
    severity: "critical",
  },
  {
    fixtureKey: "opspilot-seed-auth-errors",
    service: "auth-api",
    title: "Authentication error rate elevated",
    description: "Authentication failures exceeded the recent baseline.",
    status: "firing",
    severity: "high",
  },
  {
    fixtureKey: "opspilot-seed-inventory-recovered",
    service: "inventory-api",
    title: "Inventory synchronization recovered",
    description: "Inventory synchronization returned to normal.",
    status: "resolved",
    severity: "medium",
  },
  {
    fixtureKey: "opspilot-seed-catalog-recovered",
    service: "catalog-api",
    title: "Catalog synchronization recovered",
    description: "Catalog synchronization returned to normal.",
    status: "resolved",
    severity: "medium",
  },
  {
    fixtureKey: "opspilot-seed-payments-recovered",
    service: "payments-api",
    title: "Payment gateway connection recovered",
    description: "The payment gateway connection is healthy again.",
    status: "resolved",
    severity: "medium",
  },
];

export const runbookFixtures: RunbookInput[] = [
  {
    service: "checkout-api",
    title: "Checkout service incident response",
    content:
      "Check checkout error rate and dependency health. Correlate failures with payment and authentication alerts, record customer impact, and escalate to the owning service team.",
  },
  {
    service: "payments-api",
    title: "Payments service incident response",
    content:
      "Check payment latency and gateway connectivity. Confirm the affected payment flow, preserve transaction references for investigation, and coordinate recovery with the payment provider.",
  },
  {
    service: "auth-api",
    title: "Authentication service incident response",
    content:
      "Check authentication error rate and identity-provider availability. Verify token issuance and login failures, identify affected clients, and escalate credential or access anomalies through the security response process.",
  },
];

export async function seedOperationalData(
  store: SqliteOpsStore,
): Promise<void> {
  store.seedOperationalData(serviceFixtures, alertFixtures, runbookFixtures);
}

export async function seedOperationalDatabase(): Promise<void> {
  const store = new SqliteOpsStore();
  try {
    await seedOperationalData(store);
  } finally {
    store.close();
  }
}

async function runSeed(): Promise<void> {
  await seedOperationalDatabase();
  console.info("Seeded 5 services, 6 alerts, and 3 runbooks.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await runSeed();
}
