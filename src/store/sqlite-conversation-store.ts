import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { DomainError } from "../errors/domain-error.js";
import { closeDatabase, openDatabase } from "../models/database.js";
import type {
  ConversationMessage,
  ConversationMessageRole,
  ConversationRecord,
  ConversationSummary,
  ConversationStore,
} from "./conversation-store.js";

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

function conversationRecord(row: SqliteRow): ConversationRecord {
  return {
    id: stringField(row, "id"),
    createdAt: stringField(row, "created_at"),
  };
}

function conversationMessage(row: SqliteRow): ConversationMessage {
  const role = stringField(row, "role");
  if (role !== "user" && role !== "assistant") {
    throw new TypeError(`SQLite field role has an unsupported value: ${role}`);
  }
  return {
    id: numberField(row, "id"),
    conversationId: stringField(row, "conversation_id"),
    role,
    content: stringField(row, "content"),
    createdAt: stringField(row, "created_at"),
  };
}

function conversationSummary(row: SqliteRow): ConversationSummary {
  return {
    content: stringField(row, "content"),
    coveredThroughMessageId: numberField(row, "covered_through_message_id"),
  };
}

export class SqliteConversationStore implements ConversationStore {
  readonly _db: DatabaseSync;
  private closed = false;

  constructor(path?: string) {
    this._db = openDatabase(path);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY,
        conversation_id TEXT NOT NULL
          REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS messages_conversation_id_id_idx
        ON messages(conversation_id, id DESC);
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        conversation_id TEXT PRIMARY KEY NOT NULL
          REFERENCES conversations(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        covered_through_message_id INTEGER NOT NULL
          REFERENCES messages(id),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);
  }

  async create(): Promise<ConversationRecord> {
    this.ensureOpen();
    const id = randomUUID();
    this._db.prepare("INSERT INTO conversations (id) VALUES (?)").run(id);
    const row = this._db
      .prepare("SELECT id, created_at FROM conversations WHERE id = ?")
      .get(id);
    if (!row) {
      throw new Error("Created conversation could not be retrieved");
    }
    return conversationRecord(row);
  }

  async append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<ConversationMessage> {
    this.ensureOpen();
    if (!this.conversationExists(conversationId)) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    const result = this._db
      .prepare(
        "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
      )
      .run(conversationId, role, content);
    const row = this._db
      .prepare(
        "SELECT id, conversation_id, role, content, created_at FROM messages WHERE id = ?",
      )
      .get(Number(result.lastInsertRowid));
    if (!row) {
      throw new Error("Appended conversation message could not be retrieved");
    }
    return conversationMessage(row);
  }

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[]> {
    this.ensureOpen();
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new DomainError(
        "Message history limit must be a non-negative safe integer",
        "VALIDATION",
      );
    }
    if (!this.conversationExists(conversationId)) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    return this._db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(conversationId, limit)
      .map(conversationMessage);
  }

  async getSummary(
    conversationId: string,
  ): Promise<ConversationSummary | null> {
    this.ensureOpen();
    if (!this.conversationExists(conversationId)) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    const row = this._db
      .prepare(
        `SELECT content, covered_through_message_id
         FROM conversation_summaries
         WHERE conversation_id = ?`,
      )
      .get(conversationId);
    return row ? conversationSummary(row) : null;
  }

  async saveSummary(
    conversationId: string,
    content: string,
    coveredThroughMessageId: number,
  ): Promise<ConversationSummary> {
    this.ensureOpen();
    if (!this.conversationExists(conversationId)) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    const coverage = this._db
      .prepare(
        "SELECT 1 AS found FROM messages WHERE id = ? AND conversation_id = ?",
      )
      .get(coveredThroughMessageId, conversationId);
    if (!coverage) {
      throw new DomainError(
        "Summary coverage message not found in conversation",
        "VALIDATION",
      );
    }
    this._db
      .prepare(
        `INSERT INTO conversation_summaries
           (conversation_id, content, covered_through_message_id)
         VALUES (?, ?, ?)
         ON CONFLICT(conversation_id) DO UPDATE SET
           content = excluded.content,
           covered_through_message_id = excluded.covered_through_message_id,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
      .run(conversationId, content, coveredThroughMessageId);
    const row = this._db
      .prepare(
        `SELECT content, covered_through_message_id
         FROM conversation_summaries
         WHERE conversation_id = ?`,
      )
      .get(conversationId);
    if (!row) {
      throw new Error("Saved conversation summary could not be retrieved");
    }
    return conversationSummary(row);
  }

  async uncoveredDepartedMessages(
    conversationId: string,
    coveredThroughMessageId: number | null,
  ): Promise<ConversationMessage[]> {
    this.ensureOpen();
    if (!this.conversationExists(conversationId)) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    return this._db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = ?
           AND (? IS NULL OR id > ?)
           AND id NOT IN (
             SELECT id FROM messages
             WHERE conversation_id = ?
             ORDER BY id DESC
             LIMIT 8
           )
         ORDER BY id ASC`,
      )
      .all(
        conversationId,
        coveredThroughMessageId,
        coveredThroughMessageId,
        conversationId,
      )
      .map(conversationMessage);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeDatabase(this._db);
  }

  private conversationExists(conversationId: string): boolean {
    return (
      this._db
        .prepare("SELECT 1 AS found FROM conversations WHERE id = ?")
        .get(conversationId) !== undefined
    );
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new DomainError("Conversation store is closed", "INTERNAL");
    }
  }
}
