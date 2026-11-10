import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { SqliteRequestStore } from "../store/sqlite-request-store.js";
import type { RequestStore, RequestTrace } from "../store/request-store.js";
import { RequestTraceService } from "./request-trace-service.js";

const STARTED_AT = "2026-11-10T12:00:00.000Z";

function trace() {
  return [
    {
      node: "route" as const,
      type: "route" as const,
      content: JSON.stringify({ route: "react", reason: "simple" }),
      timestamp: STARTED_AT,
    },
    {
      node: "react" as const,
      type: "answer" as const,
      content: "done",
      timestamp: STARTED_AT,
    },
  ];
}

test("records a completed request with metrics and ordered trace", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = new RequestTraceService(store);
  try {
    await service.recordSuccess({
      requestId: "request-1",
      userId: "operator-1",
      conversationId: "conversation-1",
      strategy: "react",
      metrics: {
        calls: 2,
        latencyMs: 850,
        historyMessages: 0,
        promptTokens: 120,
        contextBreakdown: { currentMessage: 5 },
      },
      trace: trace(),
      startedAt: STARTED_AT,
      completedAt: "2026-11-10T12:00:01.000Z",
    });

    const result = await service.getRequest("request-1");
    assert.ok(result);
    assert.equal(result.request.status, "completed");
    assert.equal(result.request.errorCode, null);
    assert.equal(result.request.calls, 2);
    assert.equal(result.request.promptTokens, 120);
    assert.deepEqual(result.request.contextBreakdown, { currentMessage: 5 });
    assert.deepEqual(
      result.trace.map(({ position, node, type }) => ({ position, node, type })),
      [
        { position: 0, node: "route", type: "route" },
        { position: 1, node: "react", type: "answer" },
      ],
    );
    assert.equal(result.trace[0].payload.content, JSON.stringify({
      route: "react",
      reason: "simple",
    }));
  } finally {
    store.close();
  }
});

test("records a failed request with an error code and no metrics", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = new RequestTraceService(store);
  try {
    await service.recordFailure({
      requestId: "request-2",
      userId: "operator-1",
      errorCode: "TIMEOUT",
      latencyMs: 180_000,
      startedAt: STARTED_AT,
      completedAt: "2026-11-10T12:03:00.000Z",
    });

    const result = await service.getRequest("request-2");
    assert.ok(result);
    assert.equal(result.request.status, "failed");
    assert.equal(result.request.errorCode, "TIMEOUT");
    assert.equal(result.request.calls, null);
    assert.equal(result.request.contextBreakdown, null);
    assert.deepEqual(result.trace, []);
  } finally {
    store.close();
  }
});

test("returns null for unknown request identifiers", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = new RequestTraceService(store);
  try {
    assert.equal(await service.getRequest("missing"), null);
  } finally {
    store.close();
  }
});

test("rejects trace events with an empty node or type", async () => {
  const saved: RequestTrace[] = [];
  const store: Pick<RequestStore, "saveRequest" | "getRequest"> = {
    async saveRequest(record, trace) {
      saved.push({ request: record, trace: [...trace] });
    },
    async getRequest() {
      return null;
    },
  };
  const service = new RequestTraceService(store);

  await assert.rejects(
    service.recordSuccess({
      requestId: "request-1",
      userId: "operator-1",
      metrics: {},
      trace: [{ node: "" as never, type: "answer", content: "done" }],
      startedAt: STARTED_AT,
    }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "VALIDATION",
  );
  assert.deepEqual(saved, []);
});

test("propagates persistence failures", async () => {
  const failure = new Error("database is locked");
  const service = new RequestTraceService({
    async saveRequest() {
      throw failure;
    },
    async getRequest() {
      return null;
    },
  });

  await assert.rejects(
    service.recordSuccess({
      requestId: "request-1",
      userId: "operator-1",
      metrics: {},
      trace: [],
      startedAt: STARTED_AT,
    }),
    (error: unknown) => error === failure,
  );
});
