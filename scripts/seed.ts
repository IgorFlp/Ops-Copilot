import type { AlertSeverity, AlertStatus } from "../src/models/alert.js";
import { sequelize } from "../src/models/database.js";
import { Service } from "../src/models/service.js";
import { Alert } from "../src/models/alert.js";
import { ensureServiceFixtures } from "../src/services/service-fixtures.js";
import type { ServiceFixture } from "../src/services/service-fixtures.js";
import { migrateAlertSeverity } from "./migrate-alert-severity.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface AlertSeed {
  fixtureKey: string;
  service: string;
  title: string;
  description: string;
  status: AlertStatus;
  severity: AlertSeverity;
}

const alertFixtures: AlertSeed[] = [
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
    fixtureKey: "opspilot-seed-orders-queue",
    service: "orders-api",
    title: "Order queue backlog growing",
    description: "The order processing queue is above its target depth.",
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
    fixtureKey: "opspilot-seed-notifications-recovered",
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

export interface SeedStore {
  upsertService(service: ServiceFixture): Promise<{ id: number }>;
  upsertAlert(
    alert: AlertSeed & { serviceId: number },
  ): Promise<void>;
}

export function alertPersistenceValues(
  fixture: AlertSeed & { serviceId: number },
): Omit<AlertSeed, "service"> & { serviceId: number } {
  const { service: _service, ...values } = fixture;
  return values;
}

export async function seedOperationalData(store: SeedStore): Promise<void> {
  const serviceIds = await ensureServiceFixtures(store);

  for (const fixture of alertFixtures) {
    const serviceId = serviceIds.get(fixture.service);
    if (!serviceId) {
      throw new Error(`Seed references unknown service: ${fixture.service}`);
    }
    await store.upsertAlert({ ...fixture, serviceId });
  }
}

export async function seedOperationalDatabase(): Promise<void> {
  await migrateAlertSeverity();
  await sequelize.transaction(async (transaction) => {
    await seedOperationalData({
      async upsertService(fixture) {
        const [service, created] = await Service.findOrCreate({
          where: { slug: fixture.slug },
          defaults: fixture,
          transaction,
        });
        if (!created) await service.update(fixture, { transaction });
        return { id: service.id };
      },
      async upsertAlert(fixture) {
        const values = alertPersistenceValues(fixture);
        const { serviceId, ...alertValues } = values;
        const [alert, created] = await Alert.findOrCreate({
          where: { fixtureKey: fixture.fixtureKey },
          defaults: values,
          transaction,
        });
        if (!created) {
          await alert.update({ ...alertValues, serviceId }, { transaction });
        }
      },
    });
  });
}

async function runSeed(): Promise<void> {
  await seedOperationalDatabase();
  console.info("Seeded 5 services and 6 alerts (3 firing, 3 resolved).");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await runSeed();
}
