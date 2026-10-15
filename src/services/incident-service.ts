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
      const service = await Service.findOne({
        where: { slug: input.service },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!service) {
        throw new DomainError("Service not found", "NOT_FOUND");
      }
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
