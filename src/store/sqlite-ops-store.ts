import { DomainError } from "../errors/domain-error.js";
import { findServiceByReference } from "../services/service-reference.js";
import type { ServiceReference } from "../services/service-reference.js";
import { closeDatabase, openDatabase } from "../models/database.js";
import type { DatabaseSync } from "node:sqlite";
import type {
  AlertFilter,
  AlertInput,
  AlertRecord,
  IncidentFilter,
  IncidentRecord,
  OpenIncidentInput,
  OpsStore,
  RunbookInput,
  RunbookRecord,
  ServiceInput,
  ServiceRecord,
} from "./ops-store.js";

type SqliteRow = Record<string, unknown>;

function numberField(row: SqliteRow, field: string): number {
  const value = row[field];
  if (typeof value !== "number") {
    throw new TypeError(`SQLite field ${field} must be a number`);
  }
  return value;
}

function stringField(row: SqliteRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new TypeError(`SQLite field ${field} must be a string`);
  }
  return value;
}

function nullableStringField(
  row: SqliteRow,
  field: string,
): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError(`SQLite field ${field} must be a string or null`);
  }
  return value;
}

function serviceRecord(row: SqliteRow): ServiceRecord {
  return {
    id: numberField(row, "id"),
    slug: stringField(row, "slug"),
    name: stringField(row, "name"),
    description: stringField(row, "description"),
    tier: stringField(row, "tier") as ServiceRecord["tier"],
  };
}

function alertRecord(row: SqliteRow): AlertRecord {
  return {
    id: numberField(row, "id"),
    fixtureKey: stringField(row, "fixture_key"),
    serviceId: numberField(row, "service_id"),
    service: stringField(row, "service"),
    title: stringField(row, "title"),
    description: stringField(row, "description"),
    status: stringField(row, "status") as AlertRecord["status"],
    severity: stringField(row, "severity") as AlertRecord["severity"],
  };
}

function incidentRecord(row: SqliteRow): IncidentRecord {
  return {
    id: numberField(row, "id"),
    serviceId: numberField(row, "service_id"),
    service: stringField(row, "service"),
    title: stringField(row, "title"),
    severity: stringField(row, "severity") as IncidentRecord["severity"],
    status: stringField(row, "status") as IncidentRecord["status"],
    summary: nullableStringField(row, "summary"),
    resolvedAt: nullableStringField(row, "resolved_at"),
  };
}

function runbookRecord(row: SqliteRow): RunbookRecord {
  return {
    id: numberField(row, "id"),
    serviceId: numberField(row, "service_id"),
    service: stringField(row, "service"),
    title: stringField(row, "title"),
    content: stringField(row, "content"),
  };
}

function inTransaction<T>(operation: () => T, rollback: () => void): T {
  try {
    const result = operation();
    return result;
  } catch (error) {
    rollback();
    throw error;
  }
}

export class SqliteOpsStore implements OpsStore {
  readonly _db: DatabaseSync;
  private closed = false;

  constructor(path?: string) {
    this._db = openDatabase(path);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('tier-1', 'tier-2', 'tier-3')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY,
        fixture_key TEXT NOT NULL UNIQUE,
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('firing', 'resolved')),
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS incidents (
        id INTEGER PRIMARY KEY,
        service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
        status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
        summary TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        resolved_at TEXT,
        CHECK (
          (status = 'open' AND resolved_at IS NULL) OR
          (status = 'resolved' AND resolved_at IS NOT NULL)
        )
      );
      CREATE TABLE IF NOT EXISTS runbooks (
        id INTEGER PRIMARY KEY,
        service_id INTEGER NOT NULL UNIQUE REFERENCES services(id) ON DELETE RESTRICT,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
  }

  private getService(serviceReference: string): ServiceRecord {
    const rows = this._db
      .prepare("SELECT id, slug, name, description, tier FROM services")
      .all()
      .map(serviceRecord);
    const service = findServiceByReference(
      serviceReference,
      rows,
    );
    if (!service) {
      throw new DomainError(`Service not found: ${serviceReference}`, "NOT_FOUND");
    }
    return service;
  }

  async listServices(): Promise<ServiceRecord[]> {
    return this._db
      .prepare(
        "SELECT id, slug, name, description, tier FROM services ORDER BY id ASC",
      )
      .all()
      .map(serviceRecord);
  }

  async upsertService(input: ServiceInput): Promise<ServiceRecord> {
    const row = this._db
      .prepare(`
        INSERT INTO services (slug, name, description, tier)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          tier = excluded.tier,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        RETURNING id, slug, name, description, tier
      `)
      .get(input.slug, input.name, input.description, input.tier);
    if (!row) throw new Error("SQLite service upsert returned no record");
    return serviceRecord(row);
  }

  async listAlerts(status: AlertFilter): Promise<AlertRecord[]> {
    const rows =
      status === "all"
        ? this._db
            .prepare(`
              SELECT a.id, a.fixture_key, a.service_id, s.name AS service,
                     a.title, a.description, a.status, a.severity
              FROM alerts a
              JOIN services s ON s.id = a.service_id
              ORDER BY a.created_at ASC, a.id ASC
            `)
            .all()
        : this._db
            .prepare(`
              SELECT a.id, a.fixture_key, a.service_id, s.name AS service,
                     a.title, a.description, a.status, a.severity
              FROM alerts a
              JOIN services s ON s.id = a.service_id
              WHERE a.status = ?
              ORDER BY a.created_at ASC, a.id ASC
            `)
            .all(status);
    return rows.map(alertRecord);
  }

  async upsertAlert(input: AlertInput): Promise<void> {
    const service = this.getService(input.service);
    this._db
      .prepare(`
        INSERT INTO alerts
          (fixture_key, service_id, title, description, status, severity)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(fixture_key) DO UPDATE SET
          service_id = excluded.service_id,
          title = excluded.title,
          description = excluded.description,
          status = excluded.status,
          severity = excluded.severity,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `)
      .run(
        input.fixtureKey,
        service.id,
        input.title,
        input.description,
        input.status,
        input.severity,
      );
  }

  async openIncident(input: OpenIncidentInput): Promise<IncidentRecord> {
    const title = input.title.trim();
    if (!title) {
      throw new DomainError("Incident title is required", "VALIDATION");
    }
    const service = this.getService(input.service);
    this._db.exec("BEGIN IMMEDIATE");
    const row = inTransaction(
      () => {
        const inserted = this._db
          .prepare(`
            INSERT INTO incidents
              (service_id, title, severity, status, summary)
            VALUES (?, ?, ?, 'open', ?)
            RETURNING id, service_id, title, severity, status, summary,
                      resolved_at
          `)
          .get(
            service.id,
            title,
            input.severity,
            input.summary?.trim() || null,
          );
        if (!inserted) {
          throw new Error("SQLite incident insert returned no record");
        }
        const result = {
          ...inserted,
          service: service.name,
        };
        this._db.exec("COMMIT");
        return result;
      },
      () => this._db.exec("ROLLBACK"),
    );
    return incidentRecord(row);
  }

  async resolveIncident(id: number): Promise<IncidentRecord> {
    this._db.exec("BEGIN IMMEDIATE");
    const row = inTransaction(
      () => {
        const incident = this._db
          .prepare(`
            SELECT i.id, i.service_id, i.title, i.severity, i.status,
                   i.summary, i.resolved_at, s.name AS service
            FROM incidents i
            JOIN services s ON s.id = i.service_id
            WHERE i.id = ?
          `)
          .get(id);
        if (!incident) {
          throw new DomainError("Incident not found", "NOT_FOUND");
        }
        if (incident.status !== "open") {
          throw new DomainError("Incident is already resolved", "CONFLICT");
        }
        const resolved = this._db
          .prepare(`
            UPDATE incidents
            SET status = 'resolved',
                resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ? AND status = 'open'
            RETURNING id, service_id, title, severity, status, summary,
                      resolved_at
          `)
          .get(id);
        if (!resolved) {
          throw new DomainError("Incident is already resolved", "CONFLICT");
        }
        const result = {
          ...resolved,
          service: stringField(incident, "service"),
        };
        this._db.exec("COMMIT");
        return result;
      },
      () => this._db.exec("ROLLBACK"),
    );
    return incidentRecord(row);
  }

  async listIncidents(status: IncidentFilter): Promise<IncidentRecord[]> {
    const rows =
      status === "all"
        ? this._db
            .prepare(`
              SELECT i.id, i.service_id, s.name AS service, i.title,
                     i.severity, i.status, i.summary, i.resolved_at
              FROM incidents i
              JOIN services s ON s.id = i.service_id
              ORDER BY i.created_at ASC, i.id ASC
            `)
            .all()
        : this._db
            .prepare(`
              SELECT i.id, i.service_id, s.name AS service, i.title,
                     i.severity, i.status, i.summary, i.resolved_at
              FROM incidents i
              JOIN services s ON s.id = i.service_id
              WHERE i.status = ?
              ORDER BY i.created_at ASC, i.id ASC
            `)
            .all(status);
    return rows.map(incidentRecord);
  }

  async getRunbook(serviceReference: string): Promise<RunbookRecord> {
    const service = this.getService(serviceReference);
    const row = this._db
      .prepare(`
        SELECT r.id, r.service_id, s.name AS service, r.title, r.content
        FROM runbooks r
        JOIN services s ON s.id = r.service_id
        WHERE r.service_id = ?
      `)
      .get(service.id);
    if (!row) {
      throw new DomainError(
        `Runbook not found for service: ${serviceReference}`,
        "NOT_FOUND",
      );
    }
    return runbookRecord(row);
  }

  async upsertRunbook(input: RunbookInput): Promise<void> {
    const service = this.getService(input.service);
    this._db
      .prepare(`
        INSERT INTO runbooks (service_id, title, content)
        VALUES (?, ?, ?)
        ON CONFLICT(service_id) DO UPDATE SET
          title = excluded.title,
          content = excluded.content,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      `)
      .run(service.id, input.title, input.content);
  }

  seedOperationalData(
    services: ServiceInput[],
    alerts: AlertInput[],
    runbooks: RunbookInput[],
  ): void {
    this._db.exec("BEGIN IMMEDIATE");
    inTransaction(
      () => {
        for (const service of services) {
          this._db
            .prepare(`
              INSERT INTO services (slug, name, description, tier)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(slug) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                tier = excluded.tier,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            `)
            .run(service.slug, service.name, service.description, service.tier);
        }
        for (const alert of alerts) {
          const service = this.getService(alert.service);
          this._db
            .prepare(`
              INSERT INTO alerts
                (fixture_key, service_id, title, description, status, severity)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(fixture_key) DO UPDATE SET
                service_id = excluded.service_id,
                title = excluded.title,
                description = excluded.description,
                status = excluded.status,
                severity = excluded.severity,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            `)
            .run(
              alert.fixtureKey,
              service.id,
              alert.title,
              alert.description,
              alert.status,
              alert.severity,
            );
        }
        for (const runbook of runbooks) {
          const service = this.getService(runbook.service);
          this._db
            .prepare(`
              INSERT INTO runbooks (service_id, title, content)
              VALUES (?, ?, ?)
              ON CONFLICT(service_id) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            `)
            .run(service.id, runbook.title, runbook.content);
        }
        this._db.exec("COMMIT");
      },
      () => this._db.exec("ROLLBACK"),
    );
  }

  close(): void {
    if (this.closed) return;
    closeDatabase(this._db);
    this.closed = true;
  }
}
