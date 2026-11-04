export type ConversationMessageRole = "user" | "assistant";

export interface ConversationRecord {
  id: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: number;
  conversationId: string;
  role: ConversationMessageRole;
  content: string;
  createdAt: string;
}

export interface ConversationStore {
  create(): Promise<ConversationRecord>;
  append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<ConversationMessage>;
  lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[]>;
  close(): void;
}
