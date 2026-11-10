import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { errorHandler } from "../middleware/error-handler.js";
import { createStatsRouter } from "../routes/stats-routes.js";
import { RequestTraceService } from "../services/request-trace-service.js";
import { StatsService } from "../services/stats-service.js";
import { SqliteRequestStore } from "../store/sqlite-request-store.js";

async function withStatsServer(
  service: StatsService,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(createStatsRouter({ statsService: service }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}/stats`);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
}

test("GET /stats aggregates totals, cost, latency and groups by route and model", async () => {
  const store = new SqliteRequestStore(":memory:");
  const traces = new RequestTraceService(store);
  const service = new StatsService(store);
  const now = new Date().toISOString();
  try {
    await traces.recordSuccess({
      requestId: "request-1",
      userId: "operator-1",
      strategy: "react",
      model: "openai/gpt-4o-mini",
      metrics: { calls: 1, latencyMs: 100, promptTokens: 1_000_000 },
      trace: [],
      startedAt: now,
    });
    await traces.recordSuccess({
      requestId: "request-2",
      userId: "operator-1",
      strategy: "react",
      model: "deepseek/deepseek-v4.1-flash:free",
      metrics: { calls: 1, latencyMs: 300, promptTokens: 500_000 },
      trace: [],
      startedAt: now,
    });
    await traces.recordFailure({
      requestId: "request-3",
      userId: "operator-1",
      strategy: "plan-and-execute",
      errorCode: "TIMEOUT",
      latencyMs: 200,
      startedAt: now,
    });

    await withStatsServer(service, async (url) => {
      const response = await fetch(`${url}?since=24h`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        total: number;
        errors: number;
        tokens: number;
        cost: number;
        latency: { p50: number | null; p95: number | null };
        byRoute: Record<
          string,
          { total: number; errors: number; tokens: number; cost: number }
        >;
        byModel: Record<string, { total: number; cost: number }>;
      };
      assert.equal(body.total, 3);
      assert.equal(body.errors, 1);
      assert.equal(body.tokens, 1_500_000);
      assert.equal(body.cost, 1);
      assert.deepEqual(body.latency, { p50: 200, p95: 300 });

      assert.deepEqual(body.byRoute.react, {
        total: 2,
        errors: 0,
        tokens: 1_500_000,
        cost: 1,
        latency: { p50: 100, p95: 300 },
      });
      assert.deepEqual(body.byRoute["plan-and-execute"], {
        total: 1,
        errors: 1,
        tokens: 0,
        cost: 0,
        latency: { p50: 200, p95: 200 },
      });

      assert.equal(body.byModel["openai/gpt-4o-mini"]?.cost, 1);
      assert.equal(
        body.byModel["deepseek/deepseek-v4.1-flash:free"]?.cost,
        0,
      );
    });
  } finally {
    store.close();
  }
});

test("GET /stats excludes requests outside the time window", async () => {
  const store = new SqliteRequestStore(":memory:");
  const traces = new RequestTraceService(store);
  const service = new StatsService(store);
  const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
  try {
    await traces.recordSuccess({
      requestId: "request-old",
      userId: "operator-1",
      strategy: "react",
      model: "openai/gpt-4o-mini",
      metrics: { calls: 1, latencyMs: 100, promptTokens: 1_000 },
      trace: [],
      startedAt: old,
    });

    await withStatsServer(service, async (url) => {
      const response = await fetch(`${url}?since=1h`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        total: number;
        byRoute: Record<string, unknown>;
        byModel: Record<string, unknown>;
      };
      assert.equal(body.total, 0);
      assert.deepEqual(body.byRoute, {});
      assert.deepEqual(body.byModel, {});
    });
  } finally {
    store.close();
  }
});

test("GET /stats returns zeros for an empty window", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    const service = new StatsService(store);
    await withStatsServer(service, async (url) => {
      const response = await fetch(`${url}?since=0h`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        total: 0,
        errors: 0,
        tokens: 0,
        cost: 0,
        latency: { p50: null, p95: null },
        byRoute: {},
        byModel: {},
      });
    });
  } finally {
    store.close();
  }
});

test("GET /stats returns 400 when since is missing", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    const service = new StatsService(store);
    await withStatsServer(service, async (url) => {
      const response = await fetch(url);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "Invalid request",
        issues: [{ path: ["since"], message: "since is required" }],
      });
    });
  } finally {
    store.close();
  }
});

test("GET /stats returns 400 for an unparsable since value", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    const service = new StatsService(store);
    await withStatsServer(service, async (url) => {
      const response = await fetch(`${url}?since=abc`);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: "Invalid request",
        issues: [
          {
            path: ["since"],
            message: "since must be a duration like 24h or 7d",
          },
        ],
      });
    });
  } finally {
    store.close();
  }
});
