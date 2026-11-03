import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { seedOperationalData } from "../../scripts/seed.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import type { AlertRecord, IncidentRecord, ReflectionAction } from "./types.js";
import {
  createOpsTools,
  createOpsToolsForRequest,
  normalizeToolArguments,
  priorMutationObservation,
} from "./tools.js";

test("all operational tools use an isolated in-memory SQLite store", async () => {
  const directory = mkdtempSync(join(tmpdir(), "opspilot-tools-"));
  const databasePath = join(directory, "persistent.db");
  const previousDatabasePath = process.env.OPSPILOT_DB;
  process.env.OPSPILOT_DB = databasePath;
  const store = new SqliteOpsStore(".memory");
  try {
    await seedOperationalData(store);
    const tools = createOpsTools(store);
    const alerts = JSON.parse(String(await tools[0].invoke({}))) as AlertRecord[];
    assert.equal(alerts.length, 3);
    assert.deepEqual(await tools[3].invoke({}), "[]");
    await assert.rejects(
      tools[4].invoke({ service: "catalog-api" }),
      /Runbook not found/,
    );

    const incident = JSON.parse(
      String(
        await tools[1].invoke({
          title: "Checkout errors",
          service: "checkout",
          severity: "SEV-2",
          summary: "Customer checkout is failing.",
        }),
      ),
    ) as IncidentRecord;
    assert.equal(incident.status, "open");
    assert.equal(incident.summary, "Customer checkout is failing.");

    const openIncidents = JSON.parse(
      String(await tools[3].invoke({})),
    ) as IncidentRecord[];
    assert.deepEqual(openIncidents.map(({ id }) => id), [incident.id]);
    assert.equal(
      JSON.parse(
        String(await tools[4].invoke({ service: "checkout-api" })),
      ).title,
      "Checkout service incident response",
    );

    await tools[2].invoke({ id: incident.id });
    const allIncidents = JSON.parse(
      String(await tools[3].invoke({ status: "all" })),
    ) as IncidentRecord[];
    assert.equal(allIncidents[0].status, "resolved");
    assert.equal(typeof allIncidents[0].resolvedAt, "string");
    assert.equal(existsSync(databasePath), false);
  } finally {
    store.close();
    if (previousDatabasePath === undefined) delete process.env.OPSPILOT_DB;
    else process.env.OPSPILOT_DB = previousDatabasePath;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("request-scoped tools do not expose incident mutations for alert creation", () => {
  const alertRequest =
    "Crie um alerta de severidade low para checkout-api.";
  const incidentRequest =
    "Crie um incidente de severidade low para checkout-api.";

  const alertTools = createOpsToolsForRequest(alertRequest);
  assert.ok(alertTools.some(({ name }) => name === "list_alerts"));
  assert.ok(!alertTools.some(({ name }) => name === "open_incidente"));
  assert.ok(!alertTools.some(({ name }) => name === "resolve_incidente"));

  const incidentTools = createOpsToolsForRequest(incidentRequest);
  assert.ok(incidentTools.some(({ name }) => name === "open_incidente"));
});

test("tools expose expected names, defaults, and serialized service results", async () => {
  const calls: string[] = [];
  const tools = createOpsTools({
    async listAlerts(status) {
      calls.push(`list:${status}`);
      const alert: AlertRecord = {
        id: 1,
        fixtureKey: "seed-alert-1",
        serviceId: 1,
        service: "Payments",
        title: "Latency",
        description: "Latency high",
        status: "firing",
        severity: "critical",
      };
      return [alert];
    },
    async openIncident(input) {
      calls.push(`open:${input.service}`);
      const incident: IncidentRecord = {
        id: 10,
        serviceId: 1,
        service: "Payments",
        title: input.title,
        severity: input.severity,
        status: "open",
        summary: input.summary ?? null,
        resolvedAt: null,
      };
      return incident;
    },
    async resolveIncident(id) {
      calls.push(`resolve:${id}`);
      return {
        id,
        serviceId: 1,
        service: "Payments",
        title: "Latency",
        severity: "high",
        status: "resolved",
        summary: null,
        resolvedAt: new Date().toISOString(),
      };
    },
    async listIncidents(status) {
      calls.push(`incidents:${status}`);
      return [];
    },
    async getRunbook(service) {
      calls.push(`runbook:${service}`);
      return {
        id: 1,
        serviceId: 1,
        service: "Payments",
        title: "Payments runbook",
        content: "Check payment gateway health.",
      };
    },
  });

  assert.deepEqual(
    tools.map(({ name }) => name),
    [
      "list_alerts",
      "open_incidente",
      "resolve_incidente",
      "List_incidentes",
      "consultar_runbook",
    ],
  );
  for (const operationalTool of tools) {
    assert.ok(operationalTool.description.trim());
    for (const [field, schema] of Object.entries(
      operationalTool.schema.shape,
    )) {
      assert.ok(
        schema.description,
        `${operationalTool.name}.${field} must have a field description`,
      );
    }
  }
  const listed = await tools[0].invoke({});
  assert.equal(JSON.parse(String(listed))[0].status, "firing");
  assert.equal(await tools[1].invoke({
    title: "Latency",
    service: "payments",
    severity: "SEV-2",
  }).then((result) => JSON.parse(String(result)).id), 10);
  assert.equal(
    JSON.parse(String(await tools[2].invoke({ id: 10 }))).status,
    "resolved",
  );
  assert.equal(JSON.parse(String(await tools[3].invoke({}))).length, 0);
  assert.equal(
    JSON.parse(String(await tools[4].invoke({ service: "payments" }))).title,
    "Payments runbook",
  );
  assert.deepEqual(calls, [
    "list:firing",
    "open:payments",
    "resolve:10",
    "incidents:open",
    "runbook:payments",
  ]);
});

test("maps SEV-1 through SEV-4 to supported incident severities", async () => {
  const severities: string[] = [];
  const tools = createOpsTools({
    async listAlerts() {
      return [];
    },
    async openIncident(input) {
      severities.push(input.severity);
      return {
        id: severities.length,
        serviceId: 1,
        service: "Payments",
        title: input.title,
        severity: input.severity,
        status: "open",
      };
    },
    async resolveIncident(id) {
      throw new Error(`Unexpected resolve: ${id}`);
    },
    async listIncidents() {
      return [];
    },
    async getRunbook() {
      throw new Error("Unexpected runbook lookup");
    },
  });

  for (const severity of ["SEV-1", "sev2", "Sev 3", "SEV4"]) {
    await tools[1].invoke({
      title: "Operational incident",
      service: "payments",
      severity,
    });
  }

  assert.deepEqual(severities, ["critical", "high", "medium", "low"]);
});

test("normalizes incident_id aliases and numeric strings for incident resolution", () => {
  assert.deepEqual(
    normalizeToolArguments("resolve_incidente", { incident_id: 2 }),
    { incident_id: 2, id: 2 },
  );
  assert.deepEqual(
    normalizeToolArguments("resolve_incidente", { incidentId: "3" }),
    { incidentId: "3", id: 3 },
  );
  assert.throws(
    () =>
      normalizeToolArguments("resolve_incidente", {
        id: 2,
        incident_id: 3,
      }),
    /Conflicting incident identifiers/,
  );
});

test("tools reject malformed schemas before calling the service", async () => {
  let called = false;
  const tools = createOpsTools({
    async listAlerts() {
      called = true;
      return [];
    },
    async openIncident() {
      called = true;
      throw new DomainError("unused", "VALIDATION");
    },
    async resolveIncident() {
      called = true;
      throw new DomainError("unused", "VALIDATION");
    },
    async listIncidents() {
      called = true;
      return [];
    },
    async getRunbook() {
      called = true;
      throw new DomainError("unused", "NOT_FOUND");
    },
  });

  await assert.rejects(
    tools[1].invoke(
      JSON.parse('{"title":"","service":"payments","severity":"urgent"}'),
    ),
  );
  await assert.rejects(tools[2].invoke({ id: -1 }));
  assert.equal(called, false);
});

test("replays a completed state-changing action observation instead of mutating again", async () => {
  let openCalls = 0;
  let resolveCalls = 0;
  const completedActions: ReflectionAction[] = [
    {
      tool: "open_incidente",
      args: {
        title: " Latency ",
        service: " payments ",
        severity: "SEV-2",
      },
      observation: '{"id":25,"status":"open"}',
    },
    {
      tool: "resolve_incidente",
      args: { incident_id: "25", id: 25 },
      observation: '{"id":25,"status":"resolved"}',
    },
  ];
  const tools = createOpsTools(
    {
      async listAlerts() {
        return [];
      },
      async openIncident() {
        openCalls += 1;
        throw new Error("A completed incident must not be opened twice");
      },
      async resolveIncident() {
        resolveCalls += 1;
        throw new Error("A completed incident must not be resolved twice");
      },
      async listIncidents() {
        return [];
      },
      async getRunbook() {
        throw new Error("Unexpected runbook lookup");
      },
    },
    completedActions,
  );

  assert.equal(
    await tools[1].invoke({
      title: "Latency",
      service: "payments",
      severity: "high",
    }),
    '{"id":25,"status":"open"}',
  );
  assert.equal(
    await tools[2].invoke({ id: 25 }),
    '{"id":25,"status":"resolved"}',
  );
  assert.equal(
    priorMutationObservation(completedActions, "open_incidente", {
      severity: "high",
      service: " payments ",
      title: " Latency ",
    }),
    '{"id":25,"status":"open"}',
  );
  assert.deepEqual([openCalls, resolveCalls], [0, 0]);
});
