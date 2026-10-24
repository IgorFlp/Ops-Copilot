import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import type { ReasoningStrategy } from "../agents/types.js";
import { createStrategyRegistry } from "../agent/index.js";
import { errorHandler } from "../middleware/error-handler.js";
import { createChatRouter } from "../routes/chat-routes.js";

function fakeStrategy(
  name: string,
  received: string[],
): ReasoningStrategy {
  return {
    name,
    async run(message) {
      received.push(`${name}:${message}`);
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
  const router = createChatRouter(registry);

  await withChatServer(router, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Check alerts" }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      answer: "react answer",
      trace: [{ type: "answer", content: "react answer" }],
      metrics: { calls: 2, latencyMs: 5 },
    });
  });
  assert.deepEqual(received, ["react:Check alerts"]);
});

test("HTTP chat selects an explicitly requested registered strategy", async () => {
  const received: string[] = [];
  const registry = createStrategyRegistry([
    fakeStrategy("react", received),
    fakeStrategy("plan-and-execute", received),
  ]);
  const router = createChatRouter(registry);

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
    assert.deepEqual(await response.json(), {
      answer: "plan-and-execute answer",
      trace: [{ type: "answer", content: "plan-and-execute answer" }],
      metrics: { calls: 2, latencyMs: 5 },
    });
  });
  assert.deepEqual(received, ["plan-and-execute:Investigate checkout"]);
});
