import type { AlertStatus } from "../src/models/alert.js";
import { ensureDatabaseReady, sequelize } from "../src/models/database.js";
import { Service } from "../src/models/service.js";
import { Alert } from "../src/models/alert.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface ServiceSeed {
  slug: string;
  name: string;
  description: string;
}

interface AlertSeed {
  fixtureKey: string;
  service: string;
  title: string;
  description: string;
  status: AlertStatus;
}

const serviceFixtures: ServiceSeed[] = [
  {
    slug: "payments-api",
    name: "Payments API",
    description: "Processes customer payments.",
  },
  {
    slug: "checkout-api",
    name: "Checkout API",
    description: "Coordinates checkout sessions.",
  },
  {
    slug: "orders-api",
    name: "Orders API",
    description: "Creates and tracks customer orders.",
  },
  {
    slug: "inventory-api",
    name: "Inventory API",
    description: "Tracks product inventory.",
  },
  {
    slug: "notifications",
    name: "Notifications",
    description: "Delivers customer notifications.",
  },
];

const alertFixtures: AlertSeed[] = [
  {
    fixtureKey: "opspilot-seed-payments-latency",
    service: "payments-api",
    title: "Payment processing latency elevated",
    description: "The 95th percentile payment latency is above threshold.",
    status: "firing",
  },
  {
    fixtureKey: "opspilot-seed-checkout-errors",
    service: "checkout-api",
    title: "Checkout error rate elevated",
    description: "Checkout failures exceeded the recent baseline.",
    status: "firing",
  },
  {
    fixtureKey: "opspilot-seed-orders-queue",
    service: "orders-api",
    title: "Order queue backlog growing",
    description: "The order processing queue is above its target depth.",
    status: "firing",
  },
  {
    fixtureKey: "opspilot-seed-inventory-recovered",
    service: "inventory-api",
    title: "Inventory synchronization recovered",
    description: "Inventory synchronization returned to normal.",
    status: "resolved",
  },
  {
    fixtureKey: "opspilot-seed-notifications-recovered",
    service: "notifications",
    title: "Notification delivery recovered",
    description: "Notification delivery latency returned to normal.",
    status: "resolved",
  },
  {
    fixtureKey: "opspilot-seed-payments-recovered",
    service: "payments-api",
    title: "Payment gateway connection recovered",
    description: "The payment gateway connection is healthy again.",
    status: "resolved",
  },
];

export interface SeedStore {
  upsertService(service: ServiceSeed): Promise<{ id: number }>;
  upsertAlert(
    alert: AlertSeed & { serviceId: number },
  ): Promise<void>;
}

export async function seedOperationalData(store: SeedStore): Promise<void> {
  const serviceIds = new Map<string, number>();
  for (const fixture of serviceFixtures) {
    const service = await store.upsertService(fixture);
    serviceIds.set(fixture.slug, service.id);
  }

  for (const fixture of alertFixtures) {
    const serviceId = serviceIds.get(fixture.service);
    if (!serviceId) {
      throw new Error(`Seed references unknown service: ${fixture.service}`);
    }
    await store.upsertAlert({ ...fixture, serviceId });
  }
}

async function runSeed(): Promise<void> {
  await ensureDatabaseReady();
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
        const { serviceId, ...values } = fixture;
        const [alert, created] = await Alert.findOrCreate({
          where: { fixtureKey: fixture.fixtureKey },
          defaults: { ...values, serviceId },
          transaction,
        });
        if (!created) {
          await alert.update({ ...values, serviceId }, { transaction });
        }
      },
    });
  });
  console.info("Seeded 5 services and 6 alerts (3 firing, 3 resolved).");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await runSeed();
}
