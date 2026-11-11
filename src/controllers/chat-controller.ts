import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";
import { strategyRegistry } from "../agent/index.js";
import type { StrategyRegistry } from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import { errorDetail, logEvent } from "../lib/log.js";
import {
  createChatService,
  type ChatServiceInput,
  type ChatServiceResult,
} from "../services/chat-service.js";
import type { ChatService } from "../services/chat-service.js";
import {
  getDefaultRequestTraceService,
  type RequestTraceService,
} from "../services/request-trace-service.js";
import {
  getDefaultLearningReflector,
  getDefaultLearningTaskRunner,
  getDefaultMemoryService,
} from "../memory/memory-store.js";
import type { MemoryRecall } from "../services/memory-service.js";
import type { LearningReflector } from "../services/learning-reflector.js";
import type { LearningTaskRunner } from "../services/learning-task-runner.js";
import { getDefaultConversationStore } from "../store/default-conversation-store.js";
import type { ConversationStore } from "../store/conversation-store.js";

const DEFAULT_CHAT_TIMEOUT_MS = 180_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const PASS_THROUGH_ERROR_CODES = [
  "TIMEOUT",
  "NOT_FOUND",
  "UNSUPPORTED_STRATEGY",
  "CONFIGURATION",
  "MODEL_UNAVAILABLE",
] as const;

export interface ChatRunner {
  runChat(input: ChatServiceInput): Promise<ChatServiceResult>;
}

export interface ChatControllerOptions {
  timeoutMs?: number;
  conversationStore?: ConversationStore;
  historyMessagesThreshold?: number;
  memoryService?: MemoryRecall | null;
  learningService?: LearningReflector;
  learningTasks?: Pick<LearningTaskRunner, "schedule">;
  requestTraceService?: RequestTraceService | null;
  chatService?: ChatRunner;
}

const chatRequestSchema = z
  .object({
    userId: z.string().trim().min(1),
    message: z.string().trim().min(1),
    strategy: z
      .enum(["react", "plan-and-execute", "reflect:react", "team"])
      .optional(),
    reflect: z.boolean().default(false),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export function parseChatRequest(body: unknown): ChatRequest {
  return chatRequestSchema.parse(body);
}

async function runWithDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new DomainError("Request timed out", "TIMEOUT")),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function strategyFromTrace(trace: ChatServiceResult["trace"]): string | null {
  const route = trace.find((event) => event.type === "route");
  if (!route) return null;
  try {
    const parsed = JSON.parse(route.content) as { route?: unknown };
    return typeof parsed.route === "string" ? parsed.route : null;
  } catch {
    return null;
  }
}

function configuredModel(): string | null {
  const model = process.env.OPENROUTER_MODEL?.trim();
  return model && model.length > 0 ? model : null;
}

export function createChatController(
  registry: StrategyRegistry = strategyRegistry,
  options: ChatControllerOptions = {},
): RequestHandler {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new RangeError(
      `timeoutMs must be an integer between 1 and ${MAX_TIMER_DELAY_MS}`,
    );
  }
  let chatService: ChatRunner | undefined;
  const getChatService = (): ChatRunner => {
    if (options.chatService) return options.chatService;
    const usesDefaultMemory = options.memoryService === undefined;
    const memoryService =
      options.memoryService === null
        ? undefined
        : options.memoryService ?? getDefaultMemoryService();
    chatService ??= createChatService(
      options.conversationStore ?? getDefaultConversationStore(),
      registry,
      {
        historyMessagesThreshold: options.historyMessagesThreshold,
        memoryService,
        learningService:
          options.learningService ??
          (usesDefaultMemory ? getDefaultLearningReflector() : undefined),
        learningTasks:
          options.learningTasks ??
          (usesDefaultMemory || options.learningService
            ? getDefaultLearningTaskRunner()
            : undefined),
      },
    ) as ChatService;
    return chatService;
  };

  return async (req, res, next) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const requestTraceService =
      options.requestTraceService === null
        ? undefined
        : options.requestTraceService ?? getDefaultRequestTraceService();

    let body: ChatRequest;
    try {
      body = parseChatRequest(req.body);
    } catch (error) {
      const raw =
        typeof req.body === "object" && req.body !== null
          ? (req.body as Record<string, unknown>)
          : {};
      logEvent("chat.failure", {
        requestId,
        userId: typeof raw.userId === "string" ? raw.userId : undefined,
        conversationId:
          typeof raw.conversationId === "string"
            ? raw.conversationId
            : undefined,
        strategy: typeof raw.strategy === "string" ? raw.strategy : undefined,
        error: errorDetail(error),
      });
      next(error);
      return;
    }

    const persistFailure = async (error: unknown): Promise<void> => {
      if (!requestTraceService) return;
      try {
        await requestTraceService.recordFailure({
          requestId,
          userId: body.userId,
          conversationId: body.conversationId ?? null,
          strategy: body.strategy ?? null,
          model: configuredModel(),
          errorCode: error instanceof DomainError ? error.code : "INTERNAL",
          latencyMs: Date.now() - startedMs,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      } catch (persistError) {
        logEvent("request.persist_failure", {
          requestId,
          error: errorDetail(persistError),
        });
      }
    };

    let result: ChatServiceResult;
    try {
      result = await runWithDeadline(
        getChatService().runChat({ ...body, requestId }),
        timeoutMs,
      );
    } catch (error) {
      if (
        error instanceof DomainError &&
        (PASS_THROUGH_ERROR_CODES as readonly string[]).includes(error.code)
      ) {
        await persistFailure(error);
        logEvent("chat.failure", {
          requestId,
          userId: body.userId,
          conversationId: body.conversationId,
          strategy: body.strategy,
          error: errorDetail(error),
        });
        next(error);
        return;
      }
      logEvent("chat.execution_failure", {
        requestId,
        error: errorDetail(error),
      });
      const failure = new DomainError("Chat execution failed", "INTERNAL");
      await persistFailure(failure);
      logEvent("chat.failure", {
        requestId,
        userId: body.userId,
        conversationId: body.conversationId,
        strategy: body.strategy,
        error: errorDetail(failure),
      });
      next(failure);
      return;
    }

    if (requestTraceService) {
      try {
        await requestTraceService.recordSuccess({
          requestId,
          userId: body.userId,
          conversationId: result.conversationId,
          strategy: body.strategy ?? strategyFromTrace(result.trace),
          model: configuredModel(),
          metrics: {
            ...result.metrics,
            contextBreakdown: { ...result.metrics.contextBreakdown },
          },
          trace: result.trace,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      } catch (error) {
        logEvent("request.persist_failure", {
          requestId,
          error: errorDetail(error),
        });
        next(new DomainError("Request persistence failed", "INTERNAL"));
        return;
      }
    }

    res.status(200).json({ ...result, requestId });
  };
}
