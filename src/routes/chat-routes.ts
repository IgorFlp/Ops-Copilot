import { Router } from "express";
import { strategyRegistry } from "../agent/index.js";
import type { StrategyRegistry } from "../agent/index.js";
import {
  createChatController,
  type ChatControllerOptions,
} from "../controllers/chat-controller.js";

export function createChatRouter(
  registry: StrategyRegistry = strategyRegistry,
  options: ChatControllerOptions = {},
): Router {
  const router = Router();
  router.post("/chat", createChatController(registry, options));
  return router;
}

export const chatRouter = createChatRouter();
