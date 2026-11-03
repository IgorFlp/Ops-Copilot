import assert from "node:assert/strict";
import test from "node:test";
import { seedOperationalData } from "../../scripts/seed.js";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

test("creates exactly four operational tables and enables foreign keys", () => {
  const store = new SqliteOpsStore(".memory");
  try {
    const tables = store._db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE ? ORDER BY name",
      )
      .all("table", "sqlite_%")
      .map((row) => row.name);

    assert.deepEqual(tables, ["alerts", "incidents", "runbooks", "services"]);
    assert.equal(
      store._db.prepare("PRAGMA foreign_keys").get()?.foreign_keys,
      1,
    );
  } finally {
    store.close();
  }
});

test("closed domain values are enforced by database constraints", () => {
  const store = new SqliteOpsStore(".memory");
  try {
    const insertService = store._db.prepare(
      "INSERT INTO services (slug, name, description, tier) VALUES (?, ?, ?, ?)",
    );
    assert.throws(() =>
      insertService.run("invalid", "Invalid", "Invalid tier", "tier-4"),
    );
    insertService.run("valid-api", "Valid API", "Valid service", "tier-1");

    const insertAlert = store._db.prepare(
      "INSERT INTO alerts (fixture_key, service_id, title, description, status, severity) VALUES (?, ?, ?, ?, ?, ?)",
    );
    assert.throws(() =>
      insertAlert.run("bad-status", 1, "Bad", "Bad status", "open", "low"),
    );
    assert.throws(() =>
      insertAlert.run("bad-severity", 1, "Bad", "Bad severity", "firing", "sev1"),
    );

    const insertIncident = store._db.prepare(
      "INSERT INTO incidents (service_id, title, severity, status) VALUES (?, ?, ?, ?)",
    );
    assert.throws(() => insertIncident.run(1, "Bad severity", "sev2", "open"));
    assert.throws(() =>
      insertIncident.run(1, "Bad status", "high", "mitigated"),
    );
  } finally {
    store.close();
  }
});

test("database check constraints reject nonexistent service references", () => {
  const store = new SqliteOpsStore(".memory");
  try {
    const insertIncident = store._db.prepare(
      "INSERT INTO incidents (service_id, title, severity, status) VALUES (?, ?, ?, ?)",
    );
    assert.throws(() => insertIncident.run(999, "Orphan", "high", "open"));
  } finally {
    store.close();
  }
});

test("incident summaries, filters, and resolution timestamps persist correctly", async () => {
  const store = new SqliteOpsStore(".memory");
  try {
    await seedOperationalData(store);
    const opened = await store.openIncident({
      title: "Payment delay",
      service: "payments",
      severity: "high",
      summary: "Checkout payments are delayed.",
    });

    assert.equal(opened.status, "open");
    assert.equal(opened.summary, "Checkout payments are delayed.");
    assert.equal(opened.resolvedAt, null);
    assert.deepEqual(
      (await store.listIncidents("open")).map(({ id }) => id),
      [opened.id],
    );
    assert.deepEqual(await store.listIncidents("resolved"), []);

    const resolved = await store.resolveIncident(opened.id);
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt);
    assert.deepEqual(await store.listIncidents("open"), []);
    assert.deepEqual(
      (await store.listIncidents("resolved")).map(({ id }) => id),
      [opened.id],
    );
    assert.equal((await store.listIncidents("all")).length, 1);
    await assert.rejects(store.resolveIncident(opened.id), {
      code: "CONFLICT",
    });
    await assert.rejects(store.resolveIncident(999), { code: "NOT_FOUND" });
    await assert.rejects(
      store.openIncident({
        title: "Invalid severity",
        service: "payments",
        severity: "sev2" as never,
      }),
    );
    await assert.rejects(
      store.openIncident({
        title: "Unknown service",
        service: "unknown-service",
        severity: "high",
      }),
      { code: "NOT_FOUND" },
    );
  } finally {
    store.close();
  }
});

test("database constraints require resolution time for resolved incidents", () => {
  const store = new SqliteOpsStore(".memory");
  try {
    store._db
      .prepare("INSERT INTO services (slug, name, description, tier) VALUES (?, ?, ?, ?)")
      .run("payments-api", "Payments API", "Payments", "tier-1");
    const insertIncident = store._db.prepare(
      "INSERT INTO incidents (service_id, title, severity, status) VALUES (?, ?, ?, ?)",
    );
    assert.throws(() =>
      insertIncident.run(1, "Missing resolved time", "high", "resolved"),
    );
  } finally {
    store.close();
  }
});
