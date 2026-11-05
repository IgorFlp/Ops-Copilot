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

export interface ConversationSummary {
  content: string;
  coveredThroughMessageId: number;
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
  getSummary(conversationId: string): Promise<ConversationSummary | null>;
  saveSummary(
    conversationId: string,
    content: string,
    coveredThroughMessageId: number,
  ): Promise<ConversationSummary>;
  uncoveredDepartedMessages(
    conversationId: string,
    coveredThroughMessageId: number | null,
  ): Promise<ConversationMessage[]>;
  close(): void;
}
