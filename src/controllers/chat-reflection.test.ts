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
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(createChatRouter(registry));
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

test("reflect true decorates only the selected strategy and returns its result", async () => {
  const decorated: string[] = [];
  const invoked: string[] = [];
  const makeStrategy = (name: string): ReasoningStrategy => ({
    name,
    async run(input) {
      invoked.push(`${name}:${input}`);
      return {
        answer: `${name} answer`,
        trace: [{ type: "answer", content: `${name} answer` }],
        metrics: { calls: 2, latencyMs: 3 },
      };
    },
  });
  const registry = createStrategyRegistry(
    [makeStrategy("react"), makeStrategy("plan-and-execute")],
    (strategy) => {
      decorated.push(strategy.name);
      return {
        name: `reflect:${strategy.name}`,
        async run(input, options) {
          const result = await strategy.run(input, options);
          return {
            ...result,
            answer: `reviewed ${result.answer}`,
            trace: [
              ...result.trace,
              { type: "critique", content: "Reviewed", approved: true },
            ],
            metrics: {
              calls: result.metrics.calls + 1,
              latencyMs: result.metrics.latencyMs + 1,
            },
          };
        },
      };
    },
  );

  await withChatServer(registry, async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "Investigate",
        strategy: "plan-and-execute",
        reflect: true,
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      answer: "reviewed plan-and-execute answer",
      trace: [
        { type: "answer", content: "plan-and-execute answer" },
        { type: "critique", content: "Reviewed", approved: true },
      ],
      metrics: { calls: 3, latencyMs: 4 },
    });
  });
  assert.deepEqual(decorated, ["plan-and-execute"]);
  assert.deepEqual(invoked, ["plan-and-execute:Investigate"]);
});

test("omitted and false reflect do not apply the reflection decorator", async () => {
  const decorated: string[] = [];
  const react: ReasoningStrategy = {
    name: "react",
    async run() {
      return {
        answer: "plain",
        trace: [{ type: "answer", content: "plain" }],
        metrics: { calls: 1, latencyMs: 1 },
      };
    },
  };
  const registry = createStrategyRegistry([react], (strategy) => {
    decorated.push(strategy.name);
    return strategy;
  });

  await withChatServer(registry, async (url) => {
    for (const body of [{ message: "One" }, { message: "Two", reflect: false }]) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).answer, "plain");
    }
  });

  assert.deepEqual(decorated, []);
});
