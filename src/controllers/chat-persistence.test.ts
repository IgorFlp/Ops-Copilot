import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createStrategyRegistry } from "../agent/index.js";
import type { ChatRunner } from "./chat-controller.js";
import type { ChatServiceInput, ChatServiceResult } from "../services/chat-service.js";
import { DomainError } from "../errors/domain-error.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createChatRouter } from "../routes/chat-routes.js";
import { createRequestTraceService } from "../services/request-trace-service.js";
import { SqliteRequestStore } from "../store/sqlite-request-store.js";
import { FakeConversationStore } from "./chat-test-helpers.js";

function successResult(requestId?: string): ChatServiceResult {
  return {
    answer: "ok",
    trace: [
      {
        node: "route",
        type: "route",
        content: JSON.stringify({ route: "react", reason: "simple" }),
        timestamp: "2026-11-10T12:00:00.000Z",
      },
      {
        node: "react",
        type: "answer",
        content: "ok",
        timestamp: "2026-11-10T12:00:00.500Z",
      },
    ],
    conversationId: requestId ? `conversation-${requestId}` : "conversation-1",
    metrics: {
      calls: 2,
      latencyMs: 5,
      historyMessages: 0,
      promptTokens: 41,
      contextBreakdown: { currentMessage: 3 },
    },
  };
}

function successRunner(): ChatRunner {
  return {
    async runChat(input: ChatServiceInput) {
      return successResult(input.requestId);
    },
  };
}

function failingRunner(error: Error | DomainError): ChatRunner {
  return {
    async runChat() {
      throw error;
    },
  };
}

async function withChatServer(
  runner: ChatRunner,
  requestTraceService: ReturnType<typeof createRequestTraceService> | null,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(
    createChatRouter(createStrategyRegistry([]), {
      conversationStore: new FakeConversationStore(),
      historyMessagesThreshold: 12,
      memoryService: null,
      requestTraceService,
      chatService: runner,
    }),
  );
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

function post(url: string, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: "operator-1", message: "Check alerts" }),
    signal,
  });
}

test("persists a completed request with metrics and ordered trace before responding", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = createRequestTraceService(store);
  try {
    await withChatServer(successRunner(), service, async (url) => {
      const response = await post(url);
      assert.equal(response.status, 200);
      const requestId = response.headers.get("x-request-id");
      assert.ok(requestId);

      const record = await service.getRequest(requestId);
      assert.ok(record);
      assert.equal(record.request.status, "completed");
      assert.equal(record.request.strategy, "react");
      assert.equal(record.request.calls, 2);
      assert.equal(record.request.latencyMs, 5);
      assert.equal(record.request.promptTokens, 41);
      assert.deepEqual(record.request.contextBreakdown, { currentMessage: 3 });
      assert.deepEqual(
        record.trace.map(({ position, node, type }) => ({
          position,
          node,
          type,
        })),
        [
          { position: 0, node: "route", type: "route" },
          { position: 1, node: "react", type: "answer" },
        ],
      );
    });
  } finally {
    store.close();
  }
});

test("persists an explicit failure with its domain error code", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = createRequestTraceService(store);
  try {
    await withChatServer(
      failingRunner(new DomainError("Conversation not found", "NOT_FOUND")),
      service,
      async (url) => {
        const response = await post(url);
        assert.equal(response.status, 404);
        const requestId = response.headers.get("x-request-id");
        assert.ok(requestId);

        const record = await service.getRequest(requestId);
        assert.ok(record);
        assert.equal(record.request.status, "failed");
        assert.equal(record.request.errorCode, "NOT_FOUND");
        assert.deepEqual(record.trace, []);
      },
    );
  } finally {
    store.close();
  }
});

test("persists unexpected failures as INTERNAL", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = createRequestTraceService(store);
  try {
    await withChatServer(
      failingRunner(new Error("upstream exploded")),
      service,
      async (url) => {
        const response = await post(url);
        assert.equal(response.status, 500);
        const requestId = response.headers.get("x-request-id");
        assert.ok(requestId);

        const record = await service.getRequest(requestId);
        assert.ok(record);
        assert.equal(record.request.status, "failed");
        assert.equal(record.request.errorCode, "INTERNAL");
      },
    );
  } finally {
    store.close();
  }
});

test("returns an explicit 500 when persistence fails", async () => {
  const service = createRequestTraceService({
    async saveRequest() {
      throw new Error("database is locked");
    },
    async getRequest() {
      return null;
    },
  });

  await withChatServer(successRunner(), service, async (url) => {
    const response = await post(url);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  });
});

test("keeps records and traces correlated under 20 concurrent requests", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = createRequestTraceService(store);
  try {
    await withChatServer(successRunner(), service, async (url) => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, () => post(url)),
      );
      const requestIds = new Set<string>();

      for (const response of responses) {
        assert.equal(response.status, 200);
        const requestId = response.headers.get("x-request-id");
        assert.ok(requestId);
        const body = (await response.json()) as { requestId: string };
        assert.equal(body.requestId, requestId);
        requestIds.add(requestId);

        const record = await service.getRequest(requestId);
        assert.ok(record);
        assert.equal(record.request.requestId, requestId);
        assert.equal(record.request.status, "completed");
        assert.deepEqual(
          record.trace.map(({ position }) => position),
          [0, 1],
        );
      }

      assert.equal(requestIds.size, responses.length);
    });
  } finally {
    store.close();
  }
});
