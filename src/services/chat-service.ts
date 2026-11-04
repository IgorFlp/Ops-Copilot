import type { ReasoningResult } from "../agents/types.js";
import type { ChatStrategyInput } from "../agents/types.js";
import {
  strategyRegistry,
  type StrategyRegistry,
} from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import type { ConversationStore } from "../store/conversation-store.js";

export const DEFAULT_HISTORY_MESSAGES_THRESHOLD = 12;

export interface ChatServiceInput {
  message: string;
  strategy?: string;
  reflect?: boolean;
  conversationId?: string;
}

export interface ChatServiceResult extends ReasoningResult {
  conversationId: string;
  metrics: ReasoningResult["metrics"] & { historyMessages: number };
}

export interface ChatServiceOptions {
  historyMessagesThreshold?: number;
}

export function parseHistoryMessagesThreshold(
  value: string | undefined,
): number {
  if (value === undefined) return DEFAULT_HISTORY_MESSAGES_THRESHOLD;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new DomainError(
      "HISTORY_MESSAGES_THRESHOLD must be a positive safe integer",
      "CONFIGURATION",
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new DomainError(
      "HISTORY_MESSAGES_THRESHOLD must be a positive safe integer",
      "CONFIGURATION",
    );
  }
  return parsed;
}

function resolveHistoryThreshold(
  value: number | undefined,
): number {
  if (value === undefined) {
    return parseHistoryMessagesThreshold(
      process.env.HISTORY_MESSAGES_THRESHOLD,
    );
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DomainError(
      "HISTORY_MESSAGES_THRESHOLD must be a positive safe integer",
      "CONFIGURATION",
    );
  }
  return value;
}

export class ChatService {
  private readonly historyMessagesThreshold: number;

  constructor(
    private readonly conversations: ConversationStore,
    private readonly registry: StrategyRegistry = strategyRegistry,
    options: ChatServiceOptions = {},
  ) {
    this.historyMessagesThreshold = resolveHistoryThreshold(
      options.historyMessagesThreshold,
    );
  }

  async runChat(input: ChatServiceInput): Promise<ChatServiceResult> {
    const selected = this.registry.resolve(
      input.strategy,
      input.reflect ?? false,
    );
    const conversationId =
      input.conversationId ?? (await this.conversations.create()).id;
    const newestFirst = await this.conversations.lastMessages(
      conversationId,
      this.historyMessagesThreshold,
    );
    const history = newestFirst
      .slice(0, this.historyMessagesThreshold)
      .reverse()
      .map(({ role, content }) => ({ role, content }));

    await this.conversations.append(conversationId, "user", input.message);
    const strategyInput: ChatStrategyInput = {
      message: input.message,
      history,
    };
    let result: ReasoningResult;
    try {
      result = await selected.strategy.run(strategyInput);
    } catch {
      throw new DomainError("Chat execution failed", "INTERNAL");
    }
    await this.conversations.append(
      conversationId,
      "assistant",
      result.answer,
    );

    return {
      ...result,
      conversationId,
      metrics: {
        ...result.metrics,
        historyMessages: history.length,
      },
    };
  }
}

export function createChatService(
  conversations: ConversationStore,
  registry: StrategyRegistry = strategyRegistry,
  options: ChatServiceOptions = {},
): ChatService {
  return new ChatService(conversations, registry, options);
}
