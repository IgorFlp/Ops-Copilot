import type { ReasoningResult } from "../agents/types.js";
import type { ChatStrategyInput } from "../agents/types.js";
import {
  strategyRegistry,
  type StrategyRegistry,
} from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import type { MemoryRecall } from "./memory-service.js";
import type { ConversationStore } from "../store/conversation-store.js";
import type { CorrectionPreparation } from "./learning-reflector.js";

export const DEFAULT_HISTORY_MESSAGES_THRESHOLD = 12;
const AMBIGUOUS_CORRECTION_ANSWER =
  "I couldn't determine which saved fact this correction refers to. " +
  "Could you clarify which fact or preference you want to update?";

export interface ChatServiceInput {
  userId: string;
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
  memoryService?: MemoryRecall;
  learningService?: {
    prepareCorrection?(
      userId: string,
      latestUserMessage: string,
    ): Promise<CorrectionPreparation>;
    learn(
      userId: string,
      latestUserMessage: string,
      correction?: CorrectionPreparation,
    ): Promise<void>;
  };
  learningTasks?: {
    schedule(task: () => Promise<void>): void;
  };
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
  private readonly memoryService?: MemoryRecall;
  private readonly learningService?: ChatServiceOptions["learningService"];
  private readonly learningTasks?: ChatServiceOptions["learningTasks"];

  constructor(
    private readonly conversations: ConversationStore,
    private readonly registry: StrategyRegistry = strategyRegistry,
    options: ChatServiceOptions = {},
  ) {
    this.historyMessagesThreshold = resolveHistoryThreshold(
      options.historyMessagesThreshold,
    );
    this.memoryService = options.memoryService;
    this.learningService = options.learningService;
    this.learningTasks = options.learningTasks;
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
    const memories = this.memoryService
      ? await this.memoryService.recall(input.userId, input.message)
      : [];

    await this.conversations.append(conversationId, "user", input.message);
    const learningService = this.learningService;
    const correction = await learningService?.prepareCorrection?.(
      input.userId,
      input.message,
    );
    const strategyInput: ChatStrategyInput = {
      userId: input.userId,
      message: input.message,
      history,
      ...(memories.length > 0
        ? { memoryFacts: memories.map(({ fact }) => fact) }
        : {}),
    };
    let result: ReasoningResult;
    if (correction?.kind === "ambiguous") {
      result = {
        answer: AMBIGUOUS_CORRECTION_ANSWER,
        trace: [{ type: "answer", content: AMBIGUOUS_CORRECTION_ANSWER }],
        metrics: { calls: 0, latencyMs: 0 },
      };
    } else {
      try {
        result = await selected.strategy.run(strategyInput);
      } catch {
        throw new DomainError("Chat execution failed", "INTERNAL");
      }
    }
    await this.conversations.append(
      conversationId,
      "assistant",
      result.answer,
    );
    const learningTasks = this.learningTasks;
    if (
      learningService &&
      learningTasks &&
      correction?.kind !== "ambiguous"
    ) {
      learningTasks.schedule(() =>
        learningService.learn(input.userId, input.message, correction),
      );
    }

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
