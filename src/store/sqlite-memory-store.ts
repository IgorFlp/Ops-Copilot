import type { DatabaseSync } from "node:sqlite";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { DomainError } from "../errors/domain-error.js";
import { closeDatabase, openDatabase } from "../models/database.js";
import type { MemoryRecord, MemoryStore } from "./memory-store.js";

type SqliteRow = Record<string, unknown>;

function numberField(row: SqliteRow, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`SQLite field ${field} must be a safe integer`);
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

function encodeEmbedding(embedding: Float32Array): Uint8Array {
  validateEmbedding(embedding);
  const bytes = new Uint8Array(EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < embedding.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, embedding[index], true);
  }
  return bytes;
}

function decodeEmbedding(value: unknown): Float32Array {
  if (!(value instanceof Uint8Array)) {
    throw new TypeError("SQLite field embedding must be a BLOB");
  }
  const expectedBytes = EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT;
  if (value.byteLength !== expectedBytes) {
    throw new TypeError(
      `SQLite embedding BLOB must contain ${expectedBytes} bytes`,
    );
  }
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
  for (let index = 0; index < embedding.length; index += 1) {
    embedding[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  validateEmbedding(embedding);
  return embedding;
}

function validateEmbedding(embedding: Float32Array): void {
  if (
    embedding.length !== EMBEDDING_DIMENSIONS ||
    !embedding.every(Number.isFinite)
  ) {
    throw new DomainError(
      `Embedding must contain ${EMBEDDING_DIMENSIONS} finite Float32 values`,
      "VALIDATION",
    );
  }
}

function memoryRecord(row: SqliteRow): MemoryRecord {
  return {
    id: numberField(row, "id"),
    userId: stringField(row, "user_id"),
    fact: stringField(row, "fact"),
    embedding: decodeEmbedding(row.embedding),
    createdAt: stringField(row, "created_at"),
  };
}

export class SqliteMemoryStore implements MemoryStore {
  readonly _db: DatabaseSync;
  private closed = false;

  constructor(path?: string) {
    this._db = openDatabase(path);
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        fact TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
      CREATE INDEX IF NOT EXISTS memories_user_id_id_idx
        ON memories(user_id, id);
    `);
  }

  async all(userId: string): Promise<MemoryRecord[]> {
    this.ensureOpen();
    this.validateUserId(userId);
    return this._db
      .prepare(
        `SELECT id, user_id, fact, embedding, created_at
         FROM memories
         WHERE user_id = ?
         ORDER BY id`,
      )
      .all(userId)
      .map(memoryRecord);
  }

  async create(
    userId: string,
    fact: string,
    embedding: Float32Array,
  ): Promise<MemoryRecord> {
    this.ensureOpen();
    this.validateUserId(userId);
    if (!fact.trim()) {
      throw new DomainError("Memory fact must not be empty", "VALIDATION");
    }
    const blob = encodeEmbedding(embedding);
    const result = this._db
      .prepare(
        "INSERT INTO memories (user_id, fact, embedding) VALUES (?, ?, ?)",
      )
      .run(userId, fact, blob);
    const row = this._db
      .prepare(
        "SELECT id, user_id, fact, embedding, created_at FROM memories WHERE id = ?",
      )
      .get(Number(result.lastInsertRowid));
    if (!row) {
      throw new Error("Created memory could not be retrieved");
    }
    return memoryRecord(row);
  }

  async delete(userId: string, memoryId: number): Promise<boolean> {
    this.ensureOpen();
    this.validateUserId(userId);
    if (!Number.isSafeInteger(memoryId) || memoryId < 1) {
      throw new DomainError(
        "Memory identifier must be a positive safe integer",
        "VALIDATION",
      );
    }
    const result = this._db
      .prepare("DELETE FROM memories WHERE user_id = ? AND id = ?")
      .run(userId, memoryId);
    return result.changes === 1;
  }

  async replace(
    userId: string,
    memoryId: number,
    fact: string,
    embedding: Float32Array,
  ): Promise<boolean> {
    this.ensureOpen();
    this.validateUserId(userId);
    if (!Number.isSafeInteger(memoryId) || memoryId < 1) {
      throw new DomainError(
        "Memory identifier must be a positive safe integer",
        "VALIDATION",
      );
    }
    if (!fact.trim()) {
      throw new DomainError("Memory fact must not be empty", "VALIDATION");
    }
    const blob = encodeEmbedding(embedding);
    const result = this._db
      .prepare(
        "UPDATE memories SET fact = ?, embedding = ? WHERE user_id = ? AND id = ?",
      )
      .run(fact, blob, userId, memoryId);
    return result.changes === 1;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    closeDatabase(this._db);
  }

  private validateUserId(userId: string): void {
    if (!userId.trim()) {
      throw new DomainError("userId must not be empty", "VALIDATION");
    }
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new DomainError("Memory store is closed", "INTERNAL");
    }
  }
}
