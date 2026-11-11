import type { ReasoningResult } from "../agents/types.js";
import type { ChatStrategyInput } from "../agents/types.js";
import type { AttributedTraceEvent } from "../agents/types.js";
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
  createProductionGraph,
  type ProductionGraph,
} from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import { errorDetail, logEvent } from "../lib/log.js";
import type { Memory, MemoryRecall } from "./memory-service.js";
import type {
  ConversationMessage,
  ConversationStore,
  ConversationSummary,
} from "../store/conversation-store.js";
import type { CorrectionPreparation } from "./learning-reflector.js";
import { estimateTokens } from "../context/tokens.js";
import { buildContext } from "../context/context-builder.js";
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
  requestId?: string;
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

export interface ChatServiceResult extends Omit<ReasoningResult, "tokenUsage" | "trace"> {
  conversationId: string;
  trace: AttributedTraceEvent[];
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
  private productionGraphPromise: Promise<ProductionGraph> | null = null;

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

  private async getProductionGraph(): Promise<ProductionGraph> {
    if (!this.productionGraphPromise) {
      this.productionGraphPromise = createProductionGraph();
    }
    return this.productionGraphPromise;
  }

  async runChat(input: ChatServiceInput): Promise<ChatServiceResult> {
    const started = Date.now();
    const conversationId =
      input.conversationId ?? (await this.conversations.create()).id;
    logEvent("chat.start", {
      requestId: input.requestId,
      conversationId,
      userId: input.userId,
      strategy: input.strategy ?? "auto",
      reflect: input.reflect ?? false,
      messageChars: input.message.length,
    });
    const newestFirst = await this.conversations.lastMessages(
      conversationId,
      RECENT_HISTORY_MESSAGE_COUNT,
    );
    const history = selectRecentHistory(newestFirst);
    const { summary, summaryEvents, summaryPromptTokens } =
      await this.refreshSummary(conversationId, input.requestId);
    let memories: Memory[];
    try {
      memories = this.memoryService
        ? await this.memoryService.recall(input.userId, input.message)
        : [];
    } catch (error) {
      logEvent("memory.failure", {
        requestId: input.requestId,
        conversationId,
        userId: input.userId,
        error: errorDetail(error),
      });
      throw error;
    }
    logEvent("memory.recalled", {
      requestId: input.requestId,
      conversationId,
      userId: input.userId,
      facts: memories.length,
    });

    const context = buildContext({
      summary: summary?.content ?? null,
      history,
      memories: memories.map(({ fact, score }) => ({
        fact,
        score: score ?? 0,
      })),
      userMessage: input.message,
    });
    const sectionTokens = new Map(
      context.sections.map(({ name, tokens }) => [name, tokens]),
    );
    logEvent("context.built", {
      requestId: input.requestId,
      conversationId,
      totalTokens: context.totalTokens,
      truncated: context.truncatedSections,
      system: sectionTokens.get("system") ?? 0,
      summary: sectionTokens.get("summary") ?? 0,
      window: sectionTokens.get("window") ?? 0,
      memories: sectionTokens.get("memories") ?? 0,
    });

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
        ? {
            memoryFacts: memories.map(({ fact }) => fact),
            memoryEntries: memories.map(({ fact, score }) => ({
              fact,
              score: score ?? 0,
            })),
          }
        : {}),
    };

    let graphResult: { answer: string; trace: AttributedTraceEvent[]; metrics: { calls: number; latencyMs: number; tokenUsage?: { modelCalls: number; promptTokens?: number } } };
    if (correction?.kind === "ambiguous") {
      graphResult = {
        answer: AMBIGUOUS_CORRECTION_ANSWER,
        trace: [{ type: "answer", content: AMBIGUOUS_CORRECTION_ANSWER, node: "context", timestamp: new Date().toISOString() }],
        metrics: { calls: 0, latencyMs: 0 },
      };
    } else {
      try {
        const graph = await this.getProductionGraph();
        const initialState = {
          input: strategyInput,
          selectionSource: input.strategy ? "override" : input.reflect ? "reflect" : "auto",
          selectedStrategy: input.strategy as "react" | "plan-and-execute" | "reflect:react" | "team" | undefined,
        };
        const result = await graph.invoke(initialState);
        graphResult = {
          answer: result.strategyResult!.answer,
          trace: result.trace,
          metrics: result.metrics,
        };
      } catch (error) {
        logEvent("strategy.failure", {
          requestId: input.requestId,
          conversationId,
          strategy: input.strategy ?? "auto",
          error: errorDetail(error),
        });
        throw new DomainError("Chat execution failed", "INTERNAL");
      }
    }
    await this.conversations.append(
      conversationId,
      "assistant",
      graphResult.answer,
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

    const attributedSummaryEvents = summaryEvents.map((event) => ({
      ...event,
      node: "summary" as const,
    }));

    const contextBreakdown: ContextBreakdown = {
      currentMessage: estimateTokens(input.message),
      ...(history.length > 0
        ? { history: sectionTokens.get("window") ?? 0 }
        : {}),
      ...(memories.length > 0
        ? { memories: sectionTokens.get("memories") ?? 0 }
        : {}),
      ...(summary
        ? { summary: sectionTokens.get("summary") ?? 0 }
        : {}),
    };
    const combinedUsage = combineModelUsage(
      graphResult.metrics.tokenUsage,
      aggregateModelUsage(summaryPromptTokens),
    );
    logEvent("chat.completed", {
      requestId: input.requestId,
      conversationId,
      strategy: input.strategy ?? "auto",
      durationMs: Date.now() - started,
      calls: graphResult.metrics.calls,
      historyMessages: history.length,
      summary: summary?.coveredThroughMessageId ?? null,
      truncated: context.truncatedSections,
    });

    return {
      answer: graphResult.answer,
      trace: [...attributedSummaryEvents, ...graphResult.trace],
      conversationId,
      metrics: {
        calls: graphResult.metrics.calls,
        latencyMs: graphResult.metrics.latencyMs,
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
    requestId?: string,
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
      logEvent("summary.load_failure", {
        requestId,
        conversationId,
        error: errorDetail(error),
      });
      if (error instanceof DomainError && error.code === "NOT_FOUND") {
        throw error;
      }
      throw new DomainError("Conversation summary could not be loaded", "INTERNAL");
    }
    logEvent("summary.loaded", {
      requestId,
      conversationId,
      coveredThrough: summary?.coveredThroughMessageId ?? null,
      uncovered: uncovered.length,
    });

    const summaryEvents: ReasoningResult["trace"] = [];
    const summaryPromptTokens: Array<number | undefined> = [];
    while (true) {
      const batch = selectDepartedBatch(uncovered);
      if (!batch) break;

      logEvent("summary.batch", {
        requestId,
        conversationId,
        messages: batch.length,
        firstId: batch[0]?.id,
        lastId: batch[batch.length - 1]?.id,
      });
      let generated: Awaited<ReturnType<ConversationSummarizer["summarize"]>>;
      try {
        generated = await this.summarizer.summarize({
          previousSummary: summary?.content ?? null,
          messages: batch.map(({ role, content }) => ({ role, content })),
        });
      } catch (error) {
        logEvent("summary.failure", {
          requestId,
          conversationId,
          error: errorDetail(error),
        });
        throw new DomainError("Conversation summary update failed", "INTERNAL");
      }

      const content =
        typeof generated?.content === "string" ? generated.content.trim() : "";
      const tokenCount = estimateTokens(content);
      logEvent("summary.generated", {
        requestId,
        conversationId,
        contentChars: content.length,
        tokens: tokenCount,
        promptTokens: generated?.promptTokens,
      });
      if (!content || tokenCount < 1 || tokenCount > 200) {
        logEvent("summary.invalid", {
          requestId,
          conversationId,
          contentChars: content.length,
          tokens: tokenCount,
        });
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
        logEvent("summary.save_failure", {
          requestId,
          conversationId,
          coveredThrough: coveredThroughMessageId,
          error: errorDetail(error),
        });
        if (error instanceof DomainError && error.code === "NOT_FOUND") {
          throw error;
        }
        throw new DomainError("Conversation summary update failed", "INTERNAL");
      }
      logEvent("summary.saved", {
        requestId,
        conversationId,
        coveredThrough: coveredThroughMessageId,
        tokens: tokenCount,
      });
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
