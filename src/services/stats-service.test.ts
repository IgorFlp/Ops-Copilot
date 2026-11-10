import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import type { RequestRecord } from "../store/request-store.js";
import {
  computeStats,
  isFreeTierModel,
  parseSince,
  percentile,
  requestCost,
  StatsService,
  type StatsStore,
} from "./stats-service.js";

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

test("parseSince accepts hour, day and zero durations", () => {
  assert.deepEqual(parseSince("24h"), { window: "24h", sinceMs: 86_400_000 });
  assert.deepEqual(parseSince("1h"), { window: "1h", sinceMs: 3_600_000 });
  assert.deepEqual(parseSince("7d"), { window: "7d", sinceMs: 604_800_000 });
  assert.deepEqual(parseSince("0h"), { window: "0h", sinceMs: 0 });
});

test("parseSince rejects durations that are not hours or days", () => {
  for (const value of ["", "24", "1y", "abc", "-1h", "24m", "1H", "1d2"]) {
    assert.throws(
      () => parseSince(value),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
  }
});

test("free models cost nothing while other models use the flat rate", () => {
  assert.equal(isFreeTierModel("deepseek/deepseek-v4.1-flash:free"), true);
  assert.equal(isFreeTierModel("openai/gpt-4o-mini"), false);
  assert.equal(isFreeTierModel(null), false);

  assert.equal(requestCost(record({ promptTokens: 1_000_000 })), 1);
  assert.equal(
    requestCost(
      record({
        modelUsed: "deepseek/deepseek-v4.1-flash:free",
        promptTokens: 1_000_000,
      }),
    ),
    0,
  );
  assert.equal(requestCost(record({ promptTokens: null })), 0);
});

test("percentile uses the nearest rank of the sorted values", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([10], 95), 10);
  assert.equal(percentile([10, 20, 30, 40], 50), 20);
  assert.equal(percentile([10, 20, 30, 40], 95), 40);
  assert.equal(percentile([100, 200, 300], 50), 200);
  assert.equal(percentile([100, 200, 300], 95), 300);
});

test("computeStats aggregates totals and groups by route and model", () => {
  const records = [
    record({ requestId: "a", latencyMs: 100, promptTokens: 1_000 }),
    record({ requestId: "b", latencyMs: 200, promptTokens: 2_000 }),
    record({
      requestId: "c",
      status: "failed",
      errorCode: "TIMEOUT",
      modelUsed: "deepseek/deepseek-v4.1-flash:free",
      strategy: "plan-and-execute",
      latencyMs: 300,
      promptTokens: 3_000,
    }),
    record({
      requestId: "d",
      modelUsed: "deepseek/deepseek-v4.1-flash:free",
      strategy: null,
      latencyMs: null,
      promptTokens: null,
    }),
  ];

  const stats = computeStats(records);

  assert.equal(stats.total, 4);
  assert.equal(stats.errors, 1);
  assert.equal(stats.tokens, 6_000);
  assert.equal(stats.cost, 0.003);
  assert.deepEqual(stats.latency, { p50: 200, p95: 300 });

  assert.deepEqual(stats.byRoute, {
    react: {
      total: 2,
      errors: 0,
      tokens: 3_000,
      cost: 0.003,
      latency: { p50: 100, p95: 200 },
    },
    "plan-and-execute": {
      total: 1,
      errors: 1,
      tokens: 3_000,
      cost: 0,
      latency: { p50: 300, p95: 300 },
    },
    unknown: {
      total: 1,
      errors: 0,
      tokens: 0,
      cost: 0,
      latency: { p50: null, p95: null },
    },
  });

  assert.deepEqual(stats.byModel, {
    "openai/gpt-4o-mini": {
      total: 2,
      errors: 0,
      tokens: 3_000,
      cost: 0.003,
      latency: { p50: 100, p95: 200 },
    },
    "deepseek/deepseek-v4.1-flash:free": {
      total: 2,
      errors: 1,
      tokens: 3_000,
      cost: 0,
      latency: { p50: 300, p95: 300 },
    },
  });
});

test("computeStats returns empty aggregates without records", () => {
  const stats = computeStats([]);
  assert.equal(stats.total, 0);
  assert.equal(stats.errors, 0);
  assert.equal(stats.tokens, 0);
  assert.equal(stats.cost, 0);
  assert.deepEqual(stats.latency, { p50: null, p95: null });
  assert.deepEqual(stats.byRoute, {});
  assert.deepEqual(stats.byModel, {});
});

test("StatsService queries the store with the resolved lower bound", async () => {
  const requestedSince: string[] = [];
  const store: StatsStore = {
    async listRequestsSince(since) {
      requestedSince.push(since);
      return [record({ promptTokens: 2_000_000 })];
    },
  };
  const service = new StatsService(store);

  const before = Date.now();
  const stats = await service.getStats("1h");
  const after = Date.now();

  assert.equal(requestedSince.length, 1);
  const parsed = Date.parse(requestedSince[0]);
  assert.ok(parsed >= before - 3_600_000 - 1_000);
  assert.ok(parsed <= after - 3_600_000 + 1_000);
  assert.equal(stats.total, 1);
  assert.equal(stats.cost, 2);
});
