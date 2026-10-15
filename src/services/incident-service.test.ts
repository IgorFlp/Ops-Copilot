import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { AlertRecord, IncidentRecord } from "../agents/types.js";
import {
  createIncidentService,
  IncidentServiceStore,
} from "./incident-service.js";

function createMemoryStore(): IncidentServiceStore {
  const alerts: AlertRecord[] = [
    {
      id: 1,
      fixtureKey: "alert-a",
      serviceId: 1,
      service: "Payments",
      title: "High latency",
      description: "Latency is above threshold",
      status: "firing",
    },
    {
      id: 2,
      fixtureKey: "alert-b",
      serviceId: 1,
      service: "Payments",
      title: "Recovered",
      description: "Latency returned to normal",
      status: "resolved",
    },
  ];
  const incidents: IncidentRecord[] = [];
  let nextId = 1;
  return {
    async listAlerts(status) {
      return alerts.filter((alert) => status === "all" || alert.status === status);
    },
    async openIncident(input) {
      if (input.service !== "payments") {
        throw new DomainError("Service not found", "NOT_FOUND");
      }
      const incident: IncidentRecord = {
        id: nextId++,
        serviceId: 1,
        service: "Payments",
        title: input.title,
        severity: input.severity,
        status: "open",
      };
      incidents.push(incident);
      return { ...incident };
    },
    async resolveIncident(id) {
      const incident = incidents.find((candidate) => candidate.id === id);
      if (!incident) throw new DomainError("Incident not found", "NOT_FOUND");
      if (incident.status === "resolved") {
        throw new DomainError("Incident is already resolved", "CONFLICT");
      }
      incident.status = "resolved";
      return { ...incident };
    },
  };
}

test("lists alerts by status and returns all statuses when requested", async () => {
  const service = createIncidentService(createMemoryStore());

  assert.deepEqual(
    (await service.listAlerts("firing")).map(({ status }) => status),
    ["firing"],
  );
  assert.deepEqual(
    (await service.listAlerts("resolved")).map(({ status }) => status),
    ["resolved"],
  );
  assert.equal((await service.listAlerts("all")).length, 2);
});

test("opens and resolves an incident and rejects a second resolution", async () => {
  const service = createIncidentService(createMemoryStore());
  const opened = await service.openIncident({
    title: "Payment delay",
    service: "payments",
    severity: "high",
  });
  assert.equal(opened.status, "open");

  const resolved = await service.resolveIncident(opened.id);
  assert.equal(resolved.status, "resolved");
  await assert.rejects(
    service.resolveIncident(opened.id),
    (error: unknown) =>
      error instanceof DomainError && error.code === "CONFLICT",
  );
});

test("validates incident title and identifier and rejects unknown service", async () => {
  const service = createIncidentService(createMemoryStore());
  await assert.rejects(
    service.openIncident({
      title: " ",
      service: "payments",
      severity: "high",
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "VALIDATION",
  );
  await assert.rejects(
    service.openIncident({
      title: "Payment delay",
      service: "unknown",
      severity: "high",
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "NOT_FOUND",
  );
  await assert.rejects(service.resolveIncident(0));
});
