import { Router } from "express";
import { strategyRegistry } from "../agent/index.js";
import type { StrategyRegistry } from "../agent/index.js";
import {
  createChatController,
  type ChatControllerOptions,
} from "../controllers/chat-controller.js";
import type { ConversationStore } from "../store/conversation-store.js";

export interface ChatRouterOptions extends ChatControllerOptions {
  conversationStore?: ConversationStore;
}

export function createChatRouter(
  registry: StrategyRegistry = strategyRegistry,
  options: ChatRouterOptions = {},
): Router {
  const router = Router();
  router.post("/chat", createChatController(registry, options));
  return router;
}

export const chatRouter = createChatRouter();
