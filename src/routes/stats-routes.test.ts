import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { errorHandler } from "../middleware/error-handler.js";
import { createStatsRouter } from "./stats-routes.js";
import { StatsService, type StatsStore } from "../services/stats-service.js";
import type { RequestRecord } from "../store/request-store.js";

function record(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    requestId: "request-1",
    userId: "operator-1",
    conversationId: null,
    strategy: "react",
    modelUsed: "openai/gpt-4o-mini",
    status: "completed",
    errorCode: null,
    calls: 1,
    latencyMs: 100,
    historyMessages: 0,
    promptTokens: 1_000,
    contextBreakdown: null,
    startedAt: "2026-11-10T12:00:00.000Z",
    completedAt: "2026-11-10T12:00:01.000Z",
    createdAt: "2026-11-10T12:00:00.000Z",
    ...overrides,
  };
}

test("stats router serves GET /stats from the injected service", async () => {
  const store: StatsStore = {
    async listRequestsSince() {
      return [
        record({ latencyMs: 100, promptTokens: 1_000 }),
        record({
          requestId: "request-2",
          latencyMs: 300,
          promptTokens: 3_000,
        }),
      ];
    },
  };
  const app = express();
  app.use(createStatsRouter({ statsService: new StatsService(store) }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/stats?since=24h`,
    );
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      total: number;
      tokens: number;
      latency: { p50: number | null; p95: number | null };
    };
    assert.equal(body.total, 2);
    assert.equal(body.tokens, 4_000);
    assert.deepEqual(body.latency, { p50: 100, p95: 300 });
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
