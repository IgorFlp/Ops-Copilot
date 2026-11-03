import { DomainError } from "../errors/domain-error.js";
import type {
  AlertFilter,
  IncidentFilter,
  IncidentSeverity,
  OpenIncidentInput,
  OpsStore,
  RunbookRecord,
} from "../store/ops-store.js";
import { findServiceByReference } from "./service-reference.js";
export { findServiceByReference } from "./service-reference.js";

export type IncidentServiceStore = Pick<
  OpsStore,
  "listAlerts" | "openIncident" | "resolveIncident" | "listIncidents" | "getRunbook"
>;

const incidentSeverities: readonly IncidentSeverity[] = [
  "critical",
  "high",
  "medium",
  "low",
];
const alertFilters: readonly AlertFilter[] = [
  "firing",
  "resolved",
  "all",
];
const incidentFilters: readonly IncidentFilter[] = [
  "open",
  "resolved",
  "all",
];

export function createIncidentService(store: IncidentServiceStore) {
  return {
    async listAlerts(status: AlertFilter = "firing") {
      if (!alertFilters.includes(status)) {
        throw new DomainError("Unsupported alert status", "VALIDATION");
      }
      return store.listAlerts(status);
    },
    async openIncident(input: OpenIncidentInput) {
      const title = input.title.trim();
      const service = input.service.trim();
      if (!title) {
        throw new DomainError("Incident title is required", "VALIDATION");
      }
      if (!service) {
        throw new DomainError("Service is required", "VALIDATION");
      }
      if (!incidentSeverities.includes(input.severity)) {
        throw new DomainError("Unsupported incident severity", "VALIDATION");
      }
      return store.openIncident({
        ...input,
        title,
        service,
        summary: input.summary?.trim() || null,
      });
    },
    async resolveIncident(id: number) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new DomainError(
          "Incident id must be a positive integer",
          "VALIDATION",
        );
      }
      return store.resolveIncident(id);
    },
    async listIncidents(status: IncidentFilter = "open") {
      if (!incidentFilters.includes(status)) {
        throw new DomainError("Unsupported incident status", "VALIDATION");
      }
      return store.listIncidents(status);
    },
    async getRunbook(service: string): Promise<RunbookRecord> {
      const reference = service.trim();
      if (!reference) {
        throw new DomainError("Service is required", "VALIDATION");
      }
      return store.getRunbook(reference);
    },
  };
}
