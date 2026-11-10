import type { DatabaseSync } from "node:sqlite";
import { DomainError } from "../errors/domain-error.js";
import { addModelUsedColumn } from "../migrations/add-model-used-column.js";
import { closeDatabase, openDatabase } from "../models/database.js";
import type {
  RequestRecord,
  RequestStatus,
  RequestStore,
  RequestTrace,
  TraceEventEntry,
} from "./request-store.js";

type SqliteRow = Record<string, unknown>;

function stringField(row: SqliteRow, field: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new TypeError(`SQLite field ${field} must be a string`);
  }
  return value;
}

function nullableStringField(row: SqliteRow, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new TypeError(`SQLite field ${field} must be a string or null`);
  }
  return value;
}

function nullableNumberField(row: SqliteRow, field: string): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "number") {
    throw new TypeError(`SQLite field ${field} must be a number or null`);
  }
  return value;
}

function parseJson<T>(value: string | null, field: string): T | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new TypeError(`SQLite field ${field} must contain valid JSON`);
  }
}

function requestStatus(row: SqliteRow): RequestStatus {
  const status = stringField(row, "status");
  if (status !== "completed" && status !== "failed") {
    throw new TypeError(`SQLite field status has an unsupported value: ${status}`);
  }
  return status;
}

function requestRecord(row: SqliteRow): RequestRecord {
  return {
    requestId: stringField(row, "request_id"),
    userId: stringField(row, "user_id"),
    conversationId: nullableStringField(row, "conversation_id"),
    strategy: nullableStringField(row, "strategy"),
    modelUsed: nullableStringField(row, "model_used"),
    status: requestStatus(row),
    errorCode: nullableStringField(row, "error_code"),
    calls: nullableNumberField(row, "calls"),
    latencyMs: nullableNumberField(row, "latency_ms"),
    historyMessages: nullableNumberField(row, "history_messages"),
    promptTokens: nullableNumberField(row, "prompt_tokens"),
    contextBreakdown: parseJson<Record<string, number>>(
      nullableStringField(row, "context_breakdown"),
      "context_breakdown",
    ),
    startedAt: stringField(row, "started_at"),
    completedAt: nullableStringField(row, "completed_at"),
    createdAt: stringField(row, "created_at"),
  };
}

function traceEntry(row: SqliteRow): TraceEventEntry {
  return {
    position: (() => {
      const value = row["position"];
      if (typeof value !== "number") {
        throw new TypeError("SQLite field position must be a number");
      }
      return value;
    })(),
    node: stringField(row, "node"),
    type: stringField(row, "type"),
    payload: parseJson<Record<string, unknown>>(
      stringField(row, "payload"),
      "payload",
    )!,
    createdAt: stringField(row, "created_at"),
  };
}

function jsonOrNull(value: Record<string, number> | null): string | null {
  if (value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    throw new DomainError(
      "contextBreakdown must be JSON-serializable",
      "VALIDATION",
    );
  }
}

export class SqliteRequestStore implements RequestStore {
  readonly _db: DatabaseSync;
  private closed = false;

  constructor(path?: string) {
    this._db = openDatabase(path);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS "request" (
        request_id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        conversation_id TEXT,
        strategy TEXT,
        model_used TEXT,
        status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
        error_code TEXT,
        calls INTEGER,
        latency_ms INTEGER,
        history_messages INTEGER,
        prompt_tokens INTEGER,
        context_breakdown TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS trace_events (
        id INTEGER PRIMARY KEY,
        request_id TEXT NOT NULL
          REFERENCES "request"(request_id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        node TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (request_id, position)
      );
      CREATE INDEX IF NOT EXISTS trace_events_request_id_position_idx
        ON trace_events(request_id, position);
      CREATE INDEX IF NOT EXISTS request_started_at_idx
        ON "request"(started_at);
    `);
    addModelUsedColumn(this._db);
  }

  async saveRequest(
    record: RequestRecord,
    trace: readonly TraceEventEntry[],
  ): Promise<void> {
    this.ensureOpen();
    if (this.requestExists(record.requestId)) {
      throw new DomainError(
        `Request already exists: ${record.requestId}`,
        "CONFLICT",
      );
    }

    let contextBreakdown: string | null;
    const payloads: string[] = [];
    try {
      contextBreakdown = jsonOrNull(record.contextBreakdown);
      for (const entry of trace) {
        payloads.push(JSON.stringify(entry.payload));
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "Trace payload must be JSON-serializable",
        "VALIDATION",
      );
    }

    this._db.exec("BEGIN IMMEDIATE");
    try {
      this._db
        .prepare(
          `INSERT INTO "request" (
             request_id, user_id, conversation_id, strategy, model_used, status,
             error_code, calls, latency_ms, history_messages, prompt_tokens,
             context_breakdown, started_at, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.requestId,
          record.userId,
          record.conversationId,
          record.strategy,
          record.modelUsed,
          record.status,
          record.errorCode,
          record.calls,
          record.latencyMs,
          record.historyMessages,
          record.promptTokens,
          contextBreakdown,
          record.startedAt,
          record.completedAt,
        );

      const insertTrace = this._db.prepare(
        `INSERT INTO trace_events (request_id, position, node, type, payload)
         VALUES (?, ?, ?, ?, ?)`,
      );
      trace.forEach((entry, index) => {
        insertTrace.run(
          record.requestId,
          entry.position,
          entry.node,
          entry.type,
          payloads[index],
        );
      });

      this._db.exec("COMMIT");
    } catch (error) {
      try {
        this._db.exec("ROLLBACK");
      } catch {
        // The transaction may already have been rolled back by SQLite.
      }
      throw error;
    }
  }

  async getRequest(requestId: string): Promise<RequestTrace | null> {
    this.ensureOpen();
    const requestRow = this._db
      .prepare(
        `SELECT request_id, user_id, conversation_id, strategy, model_used, status,
                error_code, calls, latency_ms, history_messages, prompt_tokens,
                context_breakdown, started_at, completed_at, created_at
         FROM "request"
         WHERE request_id = ?`,
      )
      .get(requestId);
    if (!requestRow) return null;

    const traceRows = this._db
      .prepare(
        `SELECT position, node, type, payload, created_at
         FROM trace_events
         WHERE request_id = ?
         ORDER BY position ASC`,
      )
      .all(requestId);

    return {
      request: requestRecord(requestRow),
      trace: traceRows.map(traceEntry),
    };
  }

  async listRequestsSince(since: string): Promise<RequestRecord[]> {
    this.ensureOpen();
    const rows = this._db
      .prepare(
        `SELECT request_id, user_id, conversation_id, strategy, model_used, status,
                error_code, calls, latency_ms, history_messages, prompt_tokens,
                context_breakdown, started_at, completed_at, created_at
         FROM "request"
         WHERE started_at >= ?
         ORDER BY started_at ASC`,
      )
      .all(since);
    return rows.map(requestRecord);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeDatabase(this._db);
  }

  private requestExists(requestId: string): boolean {
    return (
      this._db
        .prepare('SELECT 1 AS found FROM "request" WHERE request_id = ?')
        .get(requestId) !== undefined
    );
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new DomainError("Request store is closed", "INTERNAL");
    }
  }
}
