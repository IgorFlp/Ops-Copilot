import { Service } from "../models/service.js";
import { ensureDatabaseReady, sequelize } from "../models/database.js";

export interface ServiceFixture {
  slug: string;
  name: string;
  description: string;
}

export interface ServiceFixtureStore {
  upsertService(service: ServiceFixture): Promise<{ id: number }>;
}

export const serviceFixtures: ServiceFixture[] = [
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
    slug: "catalog-api",
    name: "Catalog API",
    description: "Maintains product catalog data.",
  },
];

export async function ensureServiceFixtures(
  store: ServiceFixtureStore,
): Promise<Map<string, number>> {
  const serviceIds = new Map<string, number>();
  for (const fixture of serviceFixtures) {
    const service = await store.upsertService(fixture);
    serviceIds.set(fixture.slug, service.id);
  }
  return serviceIds;
}

export async function ensureSeededServices(): Promise<void> {
  await ensureDatabaseReady();
  await sequelize.transaction(async (transaction) => {
    await ensureServiceFixtures({
      async upsertService(fixture) {
        const [service, created] = await Service.findOrCreate({
          where: { slug: fixture.slug },
          defaults: fixture,
          transaction,
        });
        if (!created) await service.update(fixture, { transaction });
        return { id: service.id };
      },
    });
  });
}
