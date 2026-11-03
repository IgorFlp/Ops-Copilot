import { SqliteOpsStore } from "./sqlite-ops-store.js";

let defaultStore: SqliteOpsStore | undefined;

export function getDefaultOpsStore(): SqliteOpsStore {
  defaultStore ??= new SqliteOpsStore();
  return defaultStore;
}

export function closeDefaultOpsStore(): void {
  defaultStore?.close();
  defaultStore = undefined;
}
