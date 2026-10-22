import { DomainError } from "../errors/domain-error.js";
import { Alert, AlertStatus } from "../models/alert.js";
import { ensureDatabaseReady, sequelize } from "../models/database.js";
import { Incident, IncidentSeverity } from "../models/incident.js";
import { Service } from "../models/service.js";
import { AlertRecord, IncidentRecord } from "../agents/types.js";

export type AlertFilter = AlertStatus | "all";

export interface IncidentServiceStore {
  listAlerts(status: AlertFilter): Promise<AlertRecord[]>;
  openIncident(input: {
    title: string;
    service: string;
    severity: IncidentSeverity;
  }): Promise<IncidentRecord>;
  resolveIncident(id: number): Promise<IncidentRecord>;
}

export interface ServiceReference {
  id: number;
  name: string;
  slug: string;
}

function normalizeServiceReference(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]*api$/i, "")
    .replace(/[^a-z0-9]/g, "");
}

function differsByOneCharacter(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return differences + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

export function findServiceByReference<T extends ServiceReference>(
  reference: string,
  services: T[],
): T | undefined {
  const normalized = normalizeServiceReference(reference);
  if (!normalized) return undefined;
  const exactMatches = services.filter(
    (service) =>
      normalizeServiceReference(service.slug) === normalized ||
      normalizeServiceReference(service.name) === normalized,
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1 || normalized.length < 5) return undefined;
  const closeMatches = services.filter((service) =>
    [service.slug, service.name].some((candidate) =>
      differsByOneCharacter(normalizeServiceReference(candidate), normalized),
    ),
  );
  return closeMatches.length === 1 ? closeMatches[0] : undefined;
}

function toIncidentRecord(
  incident: Incident,
  service: Service,
): IncidentRecord {
  return {
    id: incident.id,
    serviceId: service.id,
    service: service.name,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
  };
}

const databaseStore: IncidentServiceStore = {
  async listAlerts(status) {
    await ensureDatabaseReady();
    const alerts = await Alert.findAll({
      ...(status === "all" ? {} : { where: { status } }),
      include: [{ model: Service, as: "service", required: true }],
      order: [["id", "ASC"]],
    });
    return alerts.map((alert) => {
      const service = alert.service as Service | undefined;
      if (!service) {
        throw new Error(`Alert ${alert.id} has no associated service`);
      }
      return {
        id: alert.id,
        fixtureKey: alert.fixtureKey,
        serviceId: alert.serviceId,
        service: service.name,
        title: alert.title,
        description: alert.description,
        status: alert.status,
      };
    });
  },
  async openIncident(input) {
    await ensureDatabaseReady();
    return sequelize.transaction(async (transaction) => {
      const services = await Service.findAll({
        attributes: ["id", "name", "slug"],
        transaction,
      });
      const serviceReference = findServiceByReference(input.service, services);
      if (!serviceReference) {
        throw new DomainError(`Service not found: ${input.service}`, "NOT_FOUND");
      }
      const service = await Service.findByPk(serviceReference.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!service) throw new DomainError("Service not found", "NOT_FOUND");
      const incident = await Incident.create(
        {
          serviceId: service.id,
          title: input.title.trim(),
          severity: input.severity,
          status: "open",
        },
        { transaction },
      );
      return toIncidentRecord(incident, service);
    });
  },
  async resolveIncident(id) {
    await ensureDatabaseReady();
    return sequelize.transaction(async (transaction) => {
      const incident = await Incident.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!incident) {
        throw new DomainError("Incident not found", "NOT_FOUND");
      }
      if (incident.status !== "open") {
        throw new DomainError("Incident is already resolved", "CONFLICT");
      }
      const service = await Service.findByPk(incident.serviceId, { transaction });
      if (!service) {
        throw new Error(`Service ${incident.serviceId} not found for incident`);
      }
      incident.status = "resolved";
      await incident.save({ transaction });
      return toIncidentRecord(incident, service);
    });
  },
};

export function createIncidentService(
  store: IncidentServiceStore = databaseStore,
) {
  return {
    async listAlerts(status: AlertFilter = "firing") {
      return store.listAlerts(status);
    },
    async openIncident(input: {
      title: string;
      service: string;
      severity: IncidentSeverity;
    }) {
      if (!input.title.trim()) {
        throw new DomainError("Incident title is required", "VALIDATION");
      }
      if (!input.service.trim()) {
        throw new DomainError("Service is required", "VALIDATION");
      }
      return store.openIncident({ ...input, title: input.title.trim() });
    },
    async resolveIncident(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new DomainError("Incident id must be a positive integer", "VALIDATION");
      }
      return store.resolveIncident(id);
    },
  };
}

export const incidentService = createIncidentService();
