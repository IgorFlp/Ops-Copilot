import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { ReasoningStrategy } from "../agents/types.js";
import { createStrategyRegistry } from "../agent/index.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createChatRouter } from "../routes/chat-routes.js";

async function withChatServer(
  registry: ReturnType<typeof createStrategyRegistry>,
  options: { timeoutMs?: number } | undefined,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(createChatRouter(registry, options));
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

function successStrategy(name: string): ReasoningStrategy {
  return {
    name,
    async run() {
      return {
        answer: "ok",
        trace: [],
        metrics: { calls: 1, latencyMs: 1 },
      };
    },
  };
}

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postRaw(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

test("invalid chat bodies return 400 with field issues before strategy execution", async () => {
  let calls = 0;
  const registry = createStrategyRegistry([
    {
      name: "react",
      async run() {
        calls += 1;
        return {
          answer: "unexpected",
          trace: [],
          metrics: { calls: 1, latencyMs: 0 },
        };
      },
    },
  ]);

  await withChatServer(registry, undefined, async (url) => {
    for (const body of [
      {},
      { message: "  " },
      { message: 42 },
      { message: "Check", reflect: "true" },
      { message: "Check", extra: true },
      [],
    ]) {
      const response = await post(url, body);
      assert.equal(response.status, 400);
      const payload = (await response.json()) as {
        error: string;
        issues: Array<{ path: Array<string | number>; message: string }>;
      };
      assert.equal(payload.error, "Invalid request");
      assert.ok(payload.issues.length > 0);
    }

    const malformedJson = await postRaw(url, "{");
    assert.equal(malformedJson.status, 400);
    assert.deepEqual(await malformedJson.json(), {
      error: "Invalid request",
      issues: [{ path: [], message: "Malformed JSON body" }],
    });
  });

  assert.equal(calls, 0);
});

test("unknown strategies return 422 and do not execute another strategy", async () => {
  let calls = 0;
  const registry = createStrategyRegistry([
    {
      ...successStrategy("react"),
      async run() {
        calls += 1;
        return {
          answer: "unexpected",
          trace: [],
          metrics: { calls: 1, latencyMs: 0 },
        };
      },
    },
  ]);

  await withChatServer(registry, undefined, async (url) => {
    const response = await post(url, {
      message: "Check alerts",
      strategy: "unknown",
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      error: "Unknown strategy: unknown",
    });
  });

  assert.equal(calls, 0);
});

test("strategy deadline returns 504 and strategy errors are sanitized", async () => {
  const slowRegistry = createStrategyRegistry([
    {
      name: "react",
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          answer: "late",
          trace: [],
          metrics: { calls: 1, latencyMs: 40 },
        };
      },
    },
  ]);

  await withChatServer(slowRegistry, { timeoutMs: 5 }, async (url) => {
    const response = await post(url, { message: "Wait" });
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { error: "Request timed out" });
  });

  const failingRegistry = createStrategyRegistry([
    {
      name: "react",
      async run() {
        throw new Error("private provider detail");
      },
    },
  ]);
  await withChatServer(failingRegistry, undefined, async (url) => {
    const response = await post(url, { message: "Fail" });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: "Internal server error",
    });
  });
});
