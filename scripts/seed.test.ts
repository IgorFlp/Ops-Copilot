import assert from "node:assert/strict";
import test from "node:test";
import { AlertRecord } from "../src/agents/types.js";
import { alertPersistenceValues, seedOperationalData } from "./seed.js";

test("alert seed persistence omits the service reference attribute", () => {
  const values = alertPersistenceValues({
    fixtureKey: "opspilot-seed-payments-latency",
    service: "payments-api",
    serviceId: 10,
    title: "Payment latency",
    description: "Latency is above threshold.",
    status: "firing",
    severity: "critical",
  });

  assert.deepEqual(values, {
    fixtureKey: "opspilot-seed-payments-latency",
    serviceId: 10,
    title: "Payment latency",
    description: "Latency is above threshold.",
    status: "firing",
    severity: "critical",
  });
  assert.equal("service" in values, false);
});

test("seed is idempotent and preserves unrelated services and alerts", async () => {
  const services = new Map([
    ["unrelated-service", { id: 90, name: "Unrelated", description: "Keep me" }],
  ]);
  const alerts = new Map<string, AlertRecord>([
    [
      "unrelated-alert",
      {
        id: 90,
        fixtureKey: "unrelated-alert",
        serviceId: 90,
        service: "Unrelated",
        title: "Unrelated alert",
        description: "Keep me too",
        status: "firing",
        severity: "low",
      },
    ],
  ]);
  let nextServiceId = 100;
  let nextAlertId = 100;

  const store = {
    async upsertService(service: {
      slug: string;
      name: string;
      description: string;
    }) {
      const existing = services.get(service.slug);
      if (existing) {
        services.set(service.slug, { id: existing.id, ...service });
        return { id: existing.id };
      }
      const created = { id: nextServiceId++, ...service };
      services.set(service.slug, created);
      return { id: created.id };
    },
    async upsertAlert(
      alert: {
        fixtureKey: string;
        serviceId: number;
        title: string;
        description: string;
        status: "firing" | "resolved";
        severity: "critical" | "high" | "medium" | "low";
      },
    ) {
      const service = [...services.values()].find(
        (candidate) => candidate.id === alert.serviceId,
      );
      assert.ok(service);
      const existing = alerts.get(alert.fixtureKey);
      alerts.set(alert.fixtureKey, {
        id: existing?.id ?? nextAlertId++,
        fixtureKey: alert.fixtureKey,
        serviceId: alert.serviceId,
        service: service.name,
        title: alert.title,
        description: alert.description,
        status: alert.status,
        severity: alert.severity,
      });
    },
  };

  await seedOperationalData(store);
  const firstSnapshot = JSON.stringify([
    [...services.entries()],
    [...alerts.entries()],
  ]);
  await seedOperationalData(store);
  const secondSnapshot = JSON.stringify([
    [...services.entries()],
    [...alerts.entries()],
  ]);

  assert.equal(secondSnapshot, firstSnapshot);
  assert.equal(services.size, 6);
  assert.equal(alerts.size, 7);
  for (const slug of [
    "payments-api",
    "checkout-api",
    "orders-api",
    "inventory-api",
    "catalog-api",
  ]) {
    assert.equal(services.has(slug), true);
  }
  assert.equal(
    [...alerts.values()].filter((alert) => alert.fixtureKey.startsWith("opspilot-seed") && alert.status === "firing").length,
    3,
  );
  assert.equal(
    [...alerts.values()].filter((alert) => alert.fixtureKey.startsWith("opspilot-seed") && alert.status === "resolved").length,
    3,
  );
  assert.equal(
    alerts.get("opspilot-seed-payments-latency")?.severity,
    "critical",
  );
  assert.equal(
    alerts.get("opspilot-seed-checkout-errors")?.severity,
    "critical",
  );
  assert.equal(alerts.get("opspilot-seed-orders-queue")?.severity, "high");
  assert.deepEqual(
    [
      alerts.get("opspilot-seed-inventory-recovered")?.severity,
      alerts.get("opspilot-seed-notifications-recovered")?.severity,
      alerts.get("opspilot-seed-payments-recovered")?.severity,
    ],
    ["medium", "medium", "medium"],
  );
  assert.equal(services.has("unrelated-service"), true);
  assert.equal(alerts.has("unrelated-alert"), true);
});
