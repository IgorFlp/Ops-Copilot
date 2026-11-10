import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createStrategyRegistry } from "../agent/index.js";
import type { ChatServiceResult } from "../services/chat-service.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createChatRouter } from "../routes/chat-routes.js";
import { FakeConversationStore } from "./chat-test-helpers.js";

function fakeRunner(): {
  runChat(): Promise<ChatServiceResult>;
} {
  return {
    async runChat() {
      return {
        answer: "ok",
        trace: [
          {
            type: "answer",
            content: "ok",
            node: "react",
            timestamp: "2026-11-10T12:00:00.000Z",
          },
        ],
        conversationId: "conversation-1",
        metrics: {
          calls: 1,
          latencyMs: 1,
          historyMessages: 0,
          contextBreakdown: { currentMessage: 1 },
        },
      };
    },
  };
}

function createRouter() {
  return createChatRouter(createStrategyRegistry([]), {
    conversationStore: new FakeConversationStore(),
    historyMessagesThreshold: 12,
    memoryService: null,
    requestTraceService: null,
    chatService: fakeRunner(),
  });
}

async function withChatServer(
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(createRouter());
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

function post(url: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "operator-1", message: "Check alerts" }),
  });
}

test("returns the same non-empty requestId in the body and X-Request-Id header", async () => {
  await withChatServer(async (url) => {
    const response = await post(url);
    assert.equal(response.status, 200);

    const requestId = response.headers.get("x-request-id");
    assert.ok(requestId);
    assert.ok(requestId.length > 0);

    const body = (await response.json()) as { requestId?: unknown };
    assert.equal(body.requestId, requestId);
  });
});

test("assigns distinct identifiers to separate requests", async () => {
  await withChatServer(async (url) => {
    const first = await post(url);
    const second = await post(url);
    const firstId = first.headers.get("x-request-id");
    const secondId = second.headers.get("x-request-id");

    assert.ok(firstId);
    assert.ok(secondId);
    assert.notEqual(firstId, secondId);

    const firstBody = (await first.json()) as { requestId: string };
    const secondBody = (await second.json()) as { requestId: string };
    assert.equal(firstBody.requestId, firstId);
    assert.equal(secondBody.requestId, secondId);
  });
});

test("keeps identifiers correlated under concurrent requests", async () => {
  await withChatServer(async (url) => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => post(url)),
    );
    const identifiers = new Set<string>();

    for (const response of responses) {
      assert.equal(response.status, 200);
      const header = response.headers.get("x-request-id");
      assert.ok(header);
      const body = (await response.json()) as { requestId: string };
      assert.equal(body.requestId, header);
      identifiers.add(header);
    }

    assert.equal(identifiers.size, responses.length);
  });
});
