import { DomainError } from "../errors/domain-error.js";
import type {
  ConversationMessage,
  ConversationMessageRole,
  ConversationSummary,
  ConversationStore,
} from "../store/conversation-store.js";

export class FakeConversationStore implements ConversationStore {
  readonly conversations = new Map<string, ConversationMessage[]>();
  readonly summaries = new Map<string, ConversationSummary>();
  private nextConversationId = 1;
  private nextMessageId = 1;

  async create() {
    const id = `conversation-${this.nextConversationId++}`;
    this.conversations.set(id, []);
    return { id, createdAt: "2026-11-04T00:00:00.000Z" };
  }

  async append(
    conversationId: string,
    role: ConversationMessageRole,
    content: string,
  ): Promise<ConversationMessage> {
    const messages = this.conversations.get(conversationId);
    if (!messages) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    const message = {
      id: this.nextMessageId++,
      conversationId,
      role,
      content,
      createdAt: "2026-11-04T00:00:00.000Z",
    };
    messages.push(message);
    return message;
  }

  async lastMessages(
    conversationId: string,
    limit: number,
  ): Promise<ConversationMessage[]> {
    const messages = this.conversations.get(conversationId);
    if (!messages) {
      throw new DomainError(
        `Conversation not found: ${conversationId}`,
        "NOT_FOUND",
      );
    }
    return (limit === 0 ? [] : messages.slice(-limit)).reverse();
  }

  async getSummary(conversationId: string): Promise<ConversationSummary | null> {
    if (!this.conversations.has(conversationId)) {
      throw new DomainError(`Conversation not found: ${conversationId}`, "NOT_FOUND");
    }
    return this.summaries.get(conversationId) ?? null;
  }

  async saveSummary(
    conversationId: string,
    content: string,
    coveredThroughMessageId: number,
  ): Promise<ConversationSummary> {
    const messages = this.conversations.get(conversationId);
    if (!messages) {
      throw new DomainError(`Conversation not found: ${conversationId}`, "NOT_FOUND");
    }
    if (!messages.some(({ id }) => id === coveredThroughMessageId)) {
      throw new DomainError("Summary coverage message not found", "VALIDATION");
    }
    const summary = { content, coveredThroughMessageId };
    this.summaries.set(conversationId, summary);
    return summary;
  }

  async uncoveredDepartedMessages(
    conversationId: string,
    coveredThroughMessageId: number | null,
  ): Promise<ConversationMessage[]> {
    const messages = this.conversations.get(conversationId);
    if (!messages) {
      throw new DomainError(`Conversation not found: ${conversationId}`, "NOT_FOUND");
    }
    const departed = messages.length <= 8 ? [] : messages.slice(0, -8);
    return departed.filter(
      ({ id }) => coveredThroughMessageId === null || id > coveredThroughMessageId,
    );
  }

  close(): void {}
}
