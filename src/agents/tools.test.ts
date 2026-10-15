import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { AlertRecord, IncidentRecord } from "./types.js";
import { createOpsTools } from "./tools.js";

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
    severity: "high",
  }).then((result) => JSON.parse(String(result)).id), 10);
  assert.equal(
    JSON.parse(String(await tools[2].invoke({ id: 10 }))).status,
    "resolved",
  );
  assert.deepEqual(calls, ["list:firing", "open:payments", "resolve:10"]);
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
