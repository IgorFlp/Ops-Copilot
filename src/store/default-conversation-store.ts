import { SqliteConversationStore } from "./sqlite-conversation-store.js";

let defaultStore: SqliteConversationStore | undefined;

export function getDefaultConversationStore(): SqliteConversationStore {
  defaultStore ??= new SqliteConversationStore();
  return defaultStore;
}

export function closeDefaultConversationStore(): void {
  defaultStore?.close();
  defaultStore = undefined;
}
