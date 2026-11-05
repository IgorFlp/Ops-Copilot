import type { ReasoningResult } from "../agents/types.js";
import type { ChatStrategyInput } from "../agents/types.js";
import {
  summarizeConversation,
  type ConversationSummarizer,
} from "../agents/conversation-summarizer.js";
import {
  aggregateModelUsage,
  combineModelUsage,
} from "../agents/model-usage.js";
import {
  strategyRegistry,
  type StrategyRegistry,
} from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import type { MemoryRecall } from "./memory-service.js";
import type {
  ConversationMessage,
  ConversationStore,
  ConversationSummary,
} from "../store/conversation-store.js";
import type { CorrectionPreparation } from "./learning-reflector.js";
import { estimateTokens } from "../context/tokens.js";
import {
  RECENT_HISTORY_MESSAGE_COUNT,
  selectDepartedBatch,
  selectRecentHistory,
} from "../context/history-summary.js";

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

export interface ContextBreakdown {
  currentMessage: number;
  history?: number;
  memories?: number;
  summary?: number;
}

export interface ChatServiceResult extends Omit<ReasoningResult, "tokenUsage"> {
  conversationId: string;
  metrics: ReasoningResult["metrics"] & {
    historyMessages: number;
    promptTokens?: number;
    contextBreakdown: ContextBreakdown;
  };
}

export interface ChatServiceOptions {
  historyMessagesThreshold?: number;
  summarizer?: ConversationSummarizer;
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
  private readonly memoryService?: MemoryRecall;
  private readonly learningService?: ChatServiceOptions["learningService"];
  private readonly learningTasks?: ChatServiceOptions["learningTasks"];
  private readonly summarizer: ConversationSummarizer;

  constructor(
    private readonly conversations: ConversationStore,
    private readonly registry: StrategyRegistry = strategyRegistry,
    options: ChatServiceOptions = {},
  ) {
    resolveHistoryThreshold(options.historyMessagesThreshold);
    this.summarizer = options.summarizer ?? { summarize: summarizeConversation };
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
      RECENT_HISTORY_MESSAGE_COUNT,
    );
    const history = selectRecentHistory(newestFirst);
    const { summary, summaryEvents, summaryPromptTokens } =
      await this.refreshSummary(conversationId);
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
      ...(summary ? { conversationSummary: summary.content } : {}),
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

    const publicResult = {
      answer: result.answer,
      trace: result.trace,
      metrics: result.metrics,
    };
    const contextBreakdown: ContextBreakdown = {
      currentMessage: estimateTokens(input.message),
      ...(history.length > 0
        ? { history: estimateTokens(history.map(({ content }) => content).join("")) }
        : {}),
      ...(memories.length > 0
        ? { memories: estimateTokens(memories.map(({ fact }) => fact).join("")) }
        : {}),
      ...(summary
        ? { summary: estimateTokens(summary.content) }
        : {}),
    };
    const strategyUsage =
      result.tokenUsage ??
      (result.metrics.calls > 0
        ? { modelCalls: result.metrics.calls }
        : undefined);
    const combinedUsage = combineModelUsage(
      strategyUsage,
      aggregateModelUsage(summaryPromptTokens),
    );

    return {
      ...publicResult,
      trace: [...summaryEvents, ...publicResult.trace],
      conversationId,
      metrics: {
        ...result.metrics,
        historyMessages: history.length,
        ...(combinedUsage?.promptTokens !== undefined
          ? { promptTokens: combinedUsage.promptTokens }
          : {}),
        contextBreakdown,
      },
    };
  }

  private async refreshSummary(
    conversationId: string,
  ): Promise<{
    summary: ConversationSummary | null;
    summaryEvents: ReasoningResult["trace"];
    summaryPromptTokens: Array<number | undefined>;
  }> {
    let summary: ConversationSummary | null;
    let uncovered: ConversationMessage[];
    try {
      summary = await this.conversations.getSummary(conversationId);
      uncovered = await this.conversations.uncoveredDepartedMessages(
        conversationId,
        summary?.coveredThroughMessageId ?? null,
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw error;
      }
      throw new DomainError("Conversation summary could not be loaded", "INTERNAL");
    }

    const summaryEvents: ReasoningResult["trace"] = [];
    const summaryPromptTokens: Array<number | undefined> = [];
    while (true) {
      const batch = selectDepartedBatch(uncovered);
      if (!batch) break;

      let generated: Awaited<ReturnType<ConversationSummarizer["summarize"]>>;
      try {
        generated = await this.summarizer.summarize({
          previousSummary: summary?.content ?? null,
          messages: batch.map(({ role, content }) => ({ role, content })),
        });
      } catch {
        throw new DomainError("Conversation summary update failed", "INTERNAL");
      }

      const content =
        typeof generated?.content === "string" ? generated.content.trim() : "";
      const tokenCount = estimateTokens(content);
      if (!content || tokenCount < 1 || tokenCount > 200) {
        throw new DomainError("Conversation summary update failed", "INTERNAL");
      }

      const coveredThroughMessageId = batch[batch.length - 1].id;
      try {
        summary = await this.conversations.saveSummary(
          conversationId,
          content,
          coveredThroughMessageId,
        );
      } catch (error) {
        if (error instanceof DomainError && error.code === "NOT_FOUND") {
          throw error;
        }
        throw new DomainError("Conversation summary update failed", "INTERNAL");
      }
      summaryEvents.push({ type: "summarize", content: summary.content });
      summaryPromptTokens.push(
        typeof generated.promptTokens === "number" &&
          Number.isSafeInteger(generated.promptTokens) &&
          generated.promptTokens >= 0
          ? generated.promptTokens
          : undefined,
      );
      uncovered = uncovered.slice(batch.length);
    }

    return { summary, summaryEvents, summaryPromptTokens };
  }
}

export function createChatService(
  conversations: ConversationStore,
  registry: StrategyRegistry = strategyRegistry,
  options: ChatServiceOptions = {},
): ChatService {
  return new ChatService(conversations, registry, options);
}
