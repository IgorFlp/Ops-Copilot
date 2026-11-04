import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import {
  formatStrategyInput,
  type ReasoningStrategy,
} from "../agents/types.js";
import { createStrategyRegistry } from "../agent/index.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createChatRouter } from "../routes/chat-routes.js";
import { FakeConversationStore } from "./chat-test-helpers.js";

function fakeStrategy(
  name: string,
  received: string[],
): ReasoningStrategy {
  return {
    name,
    async run(message) {
      received.push(`${name}:${formatStrategyInput(message)}`);
      return {
        answer: `${name} answer`,
        trace: [{ type: "answer", content: `${name} answer` }],
        metrics: { calls: 2, latencyMs: 5 },
      };
    },
  };
}

async function withChatServer(
  router: ReturnType<typeof createChatRouter>,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}/chat`);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
}

test("HTTP chat defaults to react and returns the unwrapped reasoning result", async () => {
  const received: string[] = [];
  const registry = createStrategyRegistry([
    fakeStrategy("react", received),
    fakeStrategy("plan-and-execute", received),
  ]);
  const conversations = new FakeConversationStore();
  const router = createChatRouter(registry, {
    conversationStore: conversations,
    historyMessagesThreshold: 12,
  });

  await withChatServer(router, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Check alerts" }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as {
      answer: string;
      trace: Array<{ type: string; content: string }>;
      metrics: { calls: number; latencyMs: number; historyMessages: number };
      conversationId: string;
    };
    assert.deepEqual(body, {
      answer: "react answer",
      trace: [{ type: "answer", content: "react answer" }],
      metrics: { calls: 2, latencyMs: 5, historyMessages: 0 },
      conversationId: "conversation-1",
    });
  });
  assert.deepEqual(received, ["react:User: Check alerts"]);
});

test("HTTP chat selects an explicitly requested registered strategy", async () => {
  const received: string[] = [];
  const registry = createStrategyRegistry([
    fakeStrategy("react", received),
    fakeStrategy("plan-and-execute", received),
  ]);
  const conversations = new FakeConversationStore();
  const router = createChatRouter(registry, {
    conversationStore: conversations,
    historyMessagesThreshold: 12,
  });

  await withChatServer(router, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Investigate checkout",
        strategy: "plan-and-execute",
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as {
      answer: string;
      trace: Array<{ type: string; content: string }>;
      metrics: { calls: number; latencyMs: number; historyMessages: number };
      conversationId: string;
    };
    assert.deepEqual(body, {
      answer: "plan-and-execute answer",
      trace: [{ type: "answer", content: "plan-and-execute answer" }],
      metrics: { calls: 2, latencyMs: 5, historyMessages: 0 },
      conversationId: "conversation-1",
    });
  });
  assert.deepEqual(received, ["plan-and-execute:User: Investigate checkout"]);
});

test("HTTP chat continues an existing conversation with ordered history", async () => {
  const conversations = new FakeConversationStore();
  const conversation = await conversations.create();
  await conversations.append(conversation.id, "user", "Check alerts");
  await conversations.append(conversation.id, "assistant", "One alert is firing.");
  const received: string[] = [];
  const registry = createStrategyRegistry([fakeStrategy("react", received)]);
  const router = createChatRouter(registry, {
    conversationStore: conversations,
    historyMessagesThreshold: 12,
  });

  await withChatServer(router, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "What should I do?",
        conversationId: conversation.id,
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json() as {
      conversationId: string;
      metrics: { historyMessages: number };
    };
    assert.equal(body.conversationId, conversation.id);
    assert.equal(body.metrics.historyMessages, 2);
  });
  assert.deepEqual(received, [
    "react:User: Check alerts\n\nAssistant: One alert is firing.\n\nUser: What should I do?",
  ]);
});

test("HTTP chat rejects unknown conversation identifiers without creating replacements", async () => {
  const conversations = new FakeConversationStore();
  const registry = createStrategyRegistry([fakeStrategy("react", [])]);
  const router = createChatRouter(registry, {
    conversationStore: conversations,
    historyMessagesThreshold: 12,
  });

  await withChatServer(router, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Follow up",
        conversationId: "missing",
      }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Conversation not found: missing",
    });
  });
  assert.equal(conversations.conversations.size, 0);
});
