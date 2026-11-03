import assert from "node:assert/strict";
import test from "node:test";
import { SqliteOpsStore } from "../src/store/sqlite-ops-store.js";
import { seedOperationalData } from "./seed.js";

test("seed is idempotent and preserves unrelated operational records", async () => {
  const store = new SqliteOpsStore(".memory");
  try {
    const unrelated = await store.upsertService({
      slug: "unrelated-service",
      name: "Unrelated Service",
      description: "Must remain after seeding.",
      tier: "tier-3",
    });
    await store.upsertAlert({
      fixtureKey: "unrelated-alert",
      service: "unrelated-service",
      title: "Unrelated alert",
      description: "Must remain after seeding.",
      status: "firing",
      severity: "low",
    });

    await seedOperationalData(store);
    const firstSeed = {
      services: await store.listServices(),
      alerts: await store.listAlerts("all"),
      runbooks: [
        await store.getRunbook("checkout"),
        await store.getRunbook("payments"),
        await store.getRunbook("auth"),
      ],
    };

    await seedOperationalData(store);
    const secondSeed = {
      services: await store.listServices(),
      alerts: await store.listAlerts("all"),
      runbooks: [
        await store.getRunbook("checkout"),
        await store.getRunbook("payments"),
        await store.getRunbook("auth"),
      ],
    };

    assert.deepEqual(secondSeed, firstSeed);
    assert.equal(firstSeed.services.length, 6);
    assert.equal(
      firstSeed.services.filter(({ slug }) => slug !== "unrelated-service")
        .length,
      5,
    );
    assert.deepEqual(
      firstSeed.services
        .filter(({ slug }) => slug !== "unrelated-service")
        .map(({ slug }) => slug)
        .sort(),
      [
        "auth-api",
        "catalog-api",
        "checkout-api",
        "inventory-api",
        "payments-api",
      ],
    );
    assert.equal(firstSeed.alerts.length, 7);
    const seededAlerts = firstSeed.alerts.filter(({ fixtureKey }) =>
      fixtureKey.startsWith("opspilot-seed-"),
    );
    assert.equal(seededAlerts.length, 6);
    assert.equal(
      seededAlerts.filter(({ status }) => status === "firing").length,
      3,
    );
    assert.equal(
      seededAlerts.filter(({ status }) => status === "resolved").length,
      3,
    );
    assert.equal(
      seededAlerts.filter(
        ({ status, severity }) => status === "firing" && severity === "critical",
      ).length,
      2,
    );
    assert.equal(
      seededAlerts.filter(
        ({ status, severity }) => status === "firing" && severity === "high",
      ).length,
      1,
    );
    assert.equal(
      seededAlerts.filter(
        ({ status, severity }) =>
          status === "resolved" && severity === "medium",
      ).length,
      3,
    );
    assert.equal(firstSeed.runbooks.length, 3);
    assert.deepEqual(
      firstSeed.runbooks.map(({ service }) => service).sort(),
      ["Auth API", "Checkout API", "Payments API"],
    );
    assert.equal(firstSeed.services.some(({ id }) => id === unrelated.id), true);
    assert.equal(
      firstSeed.alerts.some(({ fixtureKey }) => fixtureKey === "unrelated-alert"),
      true,
    );
  } finally {
    store.close();
  }
});
