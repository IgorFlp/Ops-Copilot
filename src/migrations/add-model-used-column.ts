import type { DatabaseSync } from "node:sqlite";

export const MODEL_USED_COLUMN = "model_used";

interface TableInfoRow {
  name: unknown;
}

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db
    .prepare(`PRAGMA table_info("${table}")`)
    .all() as unknown as TableInfoRow[];
  return rows.some((row) => row.name === column);
}

export function addModelUsedColumn(db: DatabaseSync): void {
  if (hasColumn(db, "request", MODEL_USED_COLUMN)) return;
  db.exec(`ALTER TABLE "request" ADD COLUMN ${MODEL_USED_COLUMN} TEXT`);
}
