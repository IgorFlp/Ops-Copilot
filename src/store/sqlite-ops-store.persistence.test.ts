import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SqliteOpsStore } from "./sqlite-ops-store.js";
import { seedOperationalData } from "../../scripts/seed.js";

test("records survive closing and reopening a file-backed SQLite store", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "opspilot-sqlite-"));
  const path = join(directory, "operations.db");
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const first = new SqliteOpsStore(path);
  let incidentId: number;
  try {
    await seedOperationalData(first);
    const opened = await first.openIncident({
      title: "Persistent incident",
      service: "payments",
      severity: "high",
      summary: "Verify state after reopening.",
    });
    incidentId = opened.id;
    await first.resolveIncident(incidentId);
  } finally {
    first.close();
  }

  const reopened = new SqliteOpsStore(path);
  try {
    assert.equal((await reopened.listServices()).length, 5);
    assert.equal((await reopened.listAlerts("all")).length, 6);
    assert.equal((await reopened.getRunbook("auth")).service, "Auth API");

    const incidents = await reopened.listIncidents("resolved");
    const incident = incidents.find(({ id }) => id === incidentId);
    assert.ok(incident);
    assert.equal(incident.status, "resolved");
    assert.equal(incident.summary, "Verify state after reopening.");
    assert.ok(incident.resolvedAt);
  } finally {
    reopened.close();
  }
});
