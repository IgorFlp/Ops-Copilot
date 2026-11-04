import type { RequestHandler } from "express";
import { z } from "zod";
import { strategyRegistry } from "../agent/index.js";
import type { StrategyRegistry } from "../agent/index.js";
import { DomainError } from "../errors/domain-error.js";
import { createChatService } from "../services/chat-service.js";
import type { ChatService } from "../services/chat-service.js";
import { getDefaultConversationStore } from "../store/default-conversation-store.js";
import type { ConversationStore } from "../store/conversation-store.js";

const DEFAULT_CHAT_TIMEOUT_MS = 180_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export interface ChatControllerOptions {
  timeoutMs?: number;
  conversationStore?: ConversationStore;
  historyMessagesThreshold?: number;
}

const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1),
    strategy: z.string().trim().min(1).default("react"),
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
  let chatService: ChatService | undefined;
  const getChatService = (): ChatService => {
    chatService ??= createChatService(
      options.conversationStore ?? getDefaultConversationStore(),
      registry,
      { historyMessagesThreshold: options.historyMessagesThreshold },
    );
    return chatService;
  };

  return async (req, res, next) => {
    try {
      const body = parseChatRequest(req.body);
      let result;
      try {
        result = await runWithDeadline(
          getChatService().runChat(body),
          timeoutMs,
        );
      } catch (error) {
        if (
          error instanceof DomainError &&
          ["TIMEOUT", "NOT_FOUND", "UNSUPPORTED_STRATEGY", "CONFIGURATION"].includes(
            error.code,
          )
        ) {
          throw error;
        }
        throw new DomainError("Chat execution failed", "INTERNAL");
      }
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
