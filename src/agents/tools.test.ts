import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { AlertRecord, IncidentRecord, ReflectionAction } from "./types.js";
import {
  createOpsTools,
  normalizeToolArguments,
  priorMutationObservation,
} from "./tools.js";

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
      };
    },
  });

  assert.deepEqual(
    tools.map(({ name }) => name),
    ["list_alerts", "open_incidente", "resolve_incidente"],
  );
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
  assert.deepEqual(calls, ["list:firing", "open:payments", "resolve:10"]);
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
