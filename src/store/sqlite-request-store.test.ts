import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { SqliteRequestStore } from "./sqlite-request-store.js";
import type { RequestRecord, TraceEventEntry } from "./request-store.js";

const STARTED_AT = "2026-11-10T12:00:00.000Z";

function record(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    requestId: "request-1",
    userId: "operator-1",
    conversationId: "conversation-1",
    strategy: "react",
    modelUsed: "openai/gpt-4o-mini",
    status: "completed",
    errorCode: null,
    calls: 2,
    latencyMs: 850,
    historyMessages: 0,
    promptTokens: 120,
    contextBreakdown: { currentMessage: 5 },
    startedAt: STARTED_AT,
    completedAt: "2026-11-10T12:00:01.000Z",
    createdAt: "",
    ...overrides,
  };
}

function entry(
  position: number,
  overrides: Partial<TraceEventEntry> = {},
): TraceEventEntry {
  return {
    position,
    node: "react",
    type: "answer",
    payload: { type: "answer", content: "done", node: "react" },
    ...overrides,
  };
}

test("persists one request with metrics and returns trace ordered by position", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    await store.saveRequest(record(), [
      entry(1, { type: "observation" }),
      entry(0, {
        type: "thought",
        payload: { type: "thought", content: "done", node: "react" },
      }),
      entry(2, { type: "answer" }),
    ]);

    const result = await store.getRequest("request-1");
    assert.ok(result);
    assert.deepEqual(result.request, {
      requestId: "request-1",
      userId: "operator-1",
      conversationId: "conversation-1",
      strategy: "react",
      modelUsed: "openai/gpt-4o-mini",
      status: "completed",
      errorCode: null,
      calls: 2,
      latencyMs: 850,
      historyMessages: 0,
      promptTokens: 120,
      contextBreakdown: { currentMessage: 5 },
      startedAt: STARTED_AT,
      completedAt: "2026-11-10T12:00:01.000Z",
      createdAt: result.request.createdAt,
    });
    assert.deepEqual(
      result.trace.map(({ position, type }) => ({ position, type })),
      [
        { position: 0, type: "thought" },
        { position: 1, type: "observation" },
        { position: 2, type: "answer" },
      ],
    );
    assert.deepEqual(result.trace[0].payload, {
      type: "thought",
      content: "done",
      node: "react",
    });
  } finally {
    store.close();
  }
});

test("returns null for an unknown request identifier", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    assert.equal(await store.getRequest("missing"), null);
  } finally {
    store.close();
  }
});

test("rejects duplicate request identifiers explicitly", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    await store.saveRequest(record(), [entry(0)]);
    await assert.rejects(
      store.saveRequest(record(), [entry(0)]),
      (error: unknown) =>
        error instanceof DomainError && error.code === "CONFLICT",
    );
  } finally {
    store.close();
  }
});

test("rolls back the request when a trace payload is not serializable", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    await assert.rejects(
      store.saveRequest(record(), [
        entry(0, { payload: circular }),
      ]),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
    assert.equal(await store.getRequest("request-1"), null);
  } finally {
    store.close();
  }
});

test("cascades trace deletion when a request is deleted", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    await store.saveRequest(record(), [entry(0), entry(1)]);
    store._db.prepare('DELETE FROM "request" WHERE request_id = ?').run("request-1");
    const count = store._db
      .prepare("SELECT COUNT(*) AS total FROM trace_events WHERE request_id = ?")
      .get("request-1") as { total: number };
    assert.equal(count.total, 0);
  } finally {
    store.close();
  }
});

test("enforces the failed status and stores error codes", async () => {
  const store = new SqliteRequestStore(":memory:");
  try {
    await store.saveRequest(
      record({
        status: "failed",
        errorCode: "TIMEOUT",
        calls: null,
        latencyMs: 180_000,
        historyMessages: null,
        promptTokens: null,
        contextBreakdown: null,
        completedAt: "2026-11-10T12:03:00.000Z",
      }),
      [],
    );
    const result = await store.getRequest("request-1");
    assert.equal(result?.request.status, "failed");
    assert.equal(result?.request.errorCode, "TIMEOUT");
    assert.deepEqual(result?.trace, []);
  } finally {
    store.close();
  }
});
