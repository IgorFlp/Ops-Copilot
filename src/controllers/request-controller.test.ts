import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { errorHandler } from "../middleware/error-handler.js";
import { createRequestRouter } from "../routes/request-routes.js";
import { RequestTraceService } from "../services/request-trace-service.js";
import { SqliteRequestStore } from "../store/sqlite-request-store.js";

const STARTED_AT = "2026-11-10T12:00:00.000Z";

function traceEvents() {
  return [
    {
      node: "route" as const,
      type: "route" as const,
      content: JSON.stringify({ route: "react", reason: "simple" }),
    },
    {
      node: "react" as const,
      type: "answer" as const,
      content: "done",
    },
  ];
}

async function withRequestServer(
  service: RequestTraceService,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(createRequestRouter({ requestTraceService: service }));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
}

test("returns the request record and trace ordered by position", async () => {
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
      trace: traceEvents(),
      startedAt: STARTED_AT,
      completedAt: "2026-11-10T12:00:01.000Z",
    });

    await withRequestServer(service, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/requests/request-1`);
      assert.equal(response.status, 200);

      const body = (await response.json()) as {
        request: {
          requestId: string;
          status: string;
          calls: number;
          promptTokens: number;
        };
        trace: Array<{ position: number; node: string; type: string; payload: { content: string } }>;
      };

      assert.equal(body.request.requestId, "request-1");
      assert.equal(body.request.status, "completed");
      assert.equal(body.request.calls, 2);
      assert.equal(body.request.promptTokens, 120);
      assert.deepEqual(
        body.trace.map(({ position, node, type }) => ({ position, node, type })),
        [
          { position: 0, node: "route", type: "route" },
          { position: 1, node: "react", type: "answer" },
        ],
      );
      assert.equal(body.trace[1].payload.content, "done");
    });
  } finally {
    store.close();
  }
});

test("returns a failed request with its error code and trace", async () => {
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

    await withRequestServer(service, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/requests/request-2`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        request: { status: string; errorCode: string | null };
        trace: unknown[];
      };
      assert.equal(body.request.status, "failed");
      assert.equal(body.request.errorCode, "TIMEOUT");
      assert.deepEqual(body.trace, []);
    });
  } finally {
    store.close();
  }
});

test("returns 404 for an unknown request identifier", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = new RequestTraceService(store);
  try {
    await withRequestServer(service, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/requests/missing`);
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "Request not found" });
    });
  } finally {
    store.close();
  }
});

test("returns 400 for an empty request identifier", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = new RequestTraceService(store);
  try {
    await withRequestServer(service, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/requests/%20`);
      assert.equal(response.status, 400);
      const body = (await response.json()) as {
        error: string;
        issues: Array<{ path: string[]; message: string }>;
      };
      assert.equal(body.error, "Invalid request");
      assert.deepEqual(body.issues[0].path, ["id"]);
    });
  } finally {
    store.close();
  }
});

test("returns every trace event for a large trace within one second", async () => {
  const store = new SqliteRequestStore(":memory:");
  const service = new RequestTraceService(store);
  try {
    const trace = Array.from({ length: 100 }, (_, index) => ({
      node: "react" as const,
      type: "observation" as const,
      content: `event-${index}`,
    }));
    await service.recordSuccess({
      requestId: "request-large",
      userId: "operator-1",
      metrics: { calls: 100, latencyMs: 10 },
      trace,
      startedAt: STARTED_AT,
    });

    await withRequestServer(service, async (baseUrl) => {
      const started = Date.now();
      const response = await fetch(`${baseUrl}/requests/request-large`);
      const elapsed = Date.now() - started;
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        trace: Array<{ position: number; payload: { content: string } }>;
      };
      assert.equal(body.trace.length, 100);
      assert.deepEqual(
        body.trace.map(({ position }) => position),
        Array.from({ length: 100 }, (_, index) => index),
      );
      assert.equal(body.trace[99].payload.content, "event-99");
      assert.ok(elapsed < 1000);
    });
  } finally {
    store.close();
  }
});
