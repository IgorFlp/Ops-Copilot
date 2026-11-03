export type ServiceTier = "tier-1" | "tier-2" | "tier-3";
export type AlertStatus = "firing" | "resolved";
export type AlertSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "resolved";
export type IncidentSeverity = AlertSeverity;
export type AlertFilter = AlertStatus | "all";
export type IncidentFilter = IncidentStatus | "all";

export interface ServiceRecord {
  id: number;
  slug: string;
  name: string;
  description: string;
  tier: ServiceTier;
}

export type ServiceInput = Omit<ServiceRecord, "id">;

export interface AlertRecord {
  id: number;
  fixtureKey: string;
  serviceId: number;
  service: string;
  title: string;
  description: string;
  status: AlertStatus;
  severity: AlertSeverity;
}

export interface AlertInput {
  fixtureKey: string;
  service: string;
  title: string;
  description: string;
  status: AlertStatus;
  severity: AlertSeverity;
}

export interface IncidentRecord {
  id: number;
  serviceId: number;
  service: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  summary?: string | null;
  resolvedAt?: string | null;
}

export interface OpenIncidentInput {
  title: string;
  service: string;
  severity: IncidentSeverity;
  summary?: string | null;
}

export interface RunbookRecord {
  id: number;
  serviceId: number;
  service: string;
  title: string;
  content: string;
}

export interface RunbookInput {
  service: string;
  title: string;
  content: string;
}

export interface OpsStore {
  listServices(): Promise<ServiceRecord[]>;
  upsertService(service: ServiceInput): Promise<ServiceRecord>;
  listAlerts(status: AlertFilter): Promise<AlertRecord[]>;
  upsertAlert(alert: AlertInput): Promise<void>;
  openIncident(input: OpenIncidentInput): Promise<IncidentRecord>;
  resolveIncident(id: number): Promise<IncidentRecord>;
  listIncidents(status: IncidentFilter): Promise<IncidentRecord[]>;
  getRunbook(service: string): Promise<RunbookRecord>;
  upsertRunbook(runbook: RunbookInput): Promise<void>;
  close(): void;
}
