import { DomainError } from "../errors/domain-error.js";
import type {
  ConversationMessage,
  ConversationMessageRole,
  ConversationStore,
} from "../store/conversation-store.js";

export class FakeConversationStore implements ConversationStore {
  readonly conversations = new Map<string, ConversationMessage[]>();
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

  close(): void {}
}
