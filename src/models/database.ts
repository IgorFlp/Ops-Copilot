import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, isAbsolute, resolve } from "node:path";

export const DEFAULT_DATABASE_PATH = "./data/opspilot.db";
export const MEMORY_DATABASE_PATH = ".memory";

export function resolveDatabasePath(
  path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH,
): string {
  if (path === MEMORY_DATABASE_PATH || path === ":memory:") {
    return ":memory:";
  }
  const resolvedPath = isAbsolute(path) ? path : resolve(path);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

export function openDatabase(
  path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH,
): DatabaseSync {
  const database = new DatabaseSync(resolveDatabasePath(path));
  database.exec("PRAGMA foreign_keys = ON");
  return database;
}

export function closeDatabase(database: DatabaseSync): void {
  database.close();
}
