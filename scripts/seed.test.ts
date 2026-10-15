import assert from "node:assert/strict";
import test from "node:test";
import { AlertRecord } from "../src/agents/types.js";
import { seedOperationalData } from "./seed.js";

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
  assert.equal(
    [...alerts.values()].filter((alert) => alert.fixtureKey.startsWith("opspilot-seed") && alert.status === "firing").length,
    3,
  );
  assert.equal(
    [...alerts.values()].filter((alert) => alert.fixtureKey.startsWith("opspilot-seed") && alert.status === "resolved").length,
    3,
  );
  assert.equal(services.has("unrelated-service"), true);
  assert.equal(alerts.has("unrelated-alert"), true);
});
