import type { ServiceInput } from "../store/ops-store.js";

export type ServiceFixture = ServiceInput;

export const serviceFixtures: ServiceFixture[] = [
  {
    slug: "payments-api",
    name: "Payments API",
    description: "Processes customer payments.",
    tier: "tier-1",
  },
  {
    slug: "checkout-api",
    name: "Checkout API",
    description: "Coordinates checkout sessions.",
    tier: "tier-1",
  },
  {
    slug: "auth-api",
    name: "Auth API",
    description: "Authenticates customers and issues access tokens.",
    tier: "tier-1",
  },
  {
    slug: "inventory-api",
    name: "Inventory API",
    description: "Tracks product inventory.",
    tier: "tier-2",
  },
  {
    slug: "catalog-api",
    name: "Catalog API",
    description: "Maintains product catalog data.",
    tier: "tier-3",
  },
];
