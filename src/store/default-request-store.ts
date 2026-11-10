import { SqliteRequestStore } from "./sqlite-request-store.js";

let defaultStore: SqliteRequestStore | undefined;

export function getDefaultRequestStore(): SqliteRequestStore {
  defaultStore ??= new SqliteRequestStore();
  return defaultStore;
}

export function closeDefaultRequestStore(): void {
  defaultStore?.close();
  defaultStore = undefined;
}
