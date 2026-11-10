import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  addModelUsedColumn,
  MODEL_USED_COLUMN,
} from "./add-model-used-column.js";

function columns(db: DatabaseSync): string[] {
  return (
    db.prepare('PRAGMA table_info("request")').all() as unknown as Array<{
      name: string;
    }>
  ).map((row) => row.name);
}

test("adds the model_used column to an existing request table", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      `CREATE TABLE "request" (
         request_id TEXT PRIMARY KEY,
         strategy TEXT,
         started_at TEXT NOT NULL
       )`,
    );
    assert.deepEqual(columns(db), ["request_id", "strategy", "started_at"]);

    addModelUsedColumn(db);
    assert.ok(columns(db).includes(MODEL_USED_COLUMN));

    addModelUsedColumn(db);
    assert.equal(
      columns(db).filter((name) => name === MODEL_USED_COLUMN).length,
      1,
    );
  } finally {
    db.close();
  }
});

test("leaves a request table that already has model_used unchanged", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      `CREATE TABLE "request" (
         request_id TEXT PRIMARY KEY,
         model_used TEXT,
         started_at TEXT NOT NULL
       )`,
    );
    addModelUsedColumn(db);
    assert.deepEqual(columns(db), ["request_id", MODEL_USED_COLUMN, "started_at"]);
  } finally {
    db.close();
  }
});
