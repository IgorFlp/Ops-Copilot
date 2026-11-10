import assert from "node:assert/strict";
import test from "node:test";
import { errorDetail, logEvent } from "./logger.js";

function captureStderr(run: () => void): string[] {
  const original = process.stderr.write;
  const lines: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
    return true;
  }) as typeof process.stderr.write;
  try {
    run();
  } finally {
    process.stderr.write = original;
  }
  return lines;
}

test("emits exactly one valid JSON line per event", () => {
  const lines = captureStderr(() => {
    logEvent("chat.start", {
      requestId: "request-1",
      messageChars: 5,
      ignored: undefined,
    });
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].split("\n").filter(Boolean).length, 1);
  const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(parsed.event, "chat.start");
  assert.equal(parsed.requestId, "request-1");
  assert.equal(parsed.messageChars, 5);
  assert.equal("ignored" in parsed, false);
  assert.equal(typeof parsed.timestamp, "string");
});

test("reduces Error values and preserves error metadata", () => {
  const lines = captureStderr(() => {
    logEvent("chat.failure", {
      requestId: "request-1",
      error: new Error("boom"),
    });
  });

  const parsed = JSON.parse(lines[0]) as {
    error: { name: string; message: string };
  };
  assert.equal(parsed.error.name, "Error");
  assert.equal(parsed.error.message, "boom");
});

test("strips content-bearing top-level fields but keeps error messages", () => {
  const lines = captureStderr(() => {
    logEvent("chat.test", {
      requestId: "request-1",
      message: "user secret text",
      content: "assistant secret text",
      answer: "answer secret",
      prompt: "prompt secret",
      toolArgs: { secret: true },
      args: { secret: true },
      facts: ["secret fact"],
      memoryFacts: ["secret fact"],
      summary: "secret summary",
      error: {
        name: "DomainError",
        message: "safe error message",
        code: "INTERNAL",
      },
    });
  });

  const raw = lines[0];
  assert.ok(!raw.includes("user secret text"));
  assert.ok(!raw.includes("assistant secret text"));
  assert.ok(!raw.includes("answer secret"));
  assert.ok(!raw.includes("prompt secret"));
  assert.ok(!raw.includes("secret fact"));
  assert.ok(!raw.includes("secret summary"));

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(parsed.message, "[redacted]");
  assert.equal(parsed.content, "[redacted]");
  assert.equal(parsed.answer, "[redacted]");
  assert.equal(parsed.prompt, "[redacted]");
  assert.deepEqual(parsed.toolArgs, "[redacted]");
  assert.deepEqual(parsed.facts, "[redacted]");
  assert.equal(parsed.requestId, "request-1");
  assert.deepEqual(parsed.error, {
    name: "DomainError",
    message: "safe error message",
    code: "INTERNAL",
  });
});

test("serializes circular values without breaking the JSON line", () => {
  const circular: Record<string, unknown> = {};
  circular.self = circular;

  const lines = captureStderr(() => {
    logEvent("chat.test", { requestId: "request-1", data: circular });
  });

  const parsed = JSON.parse(lines[0]) as {
    data: { self: string };
  };
  assert.equal(parsed.data.self, "[circular]");
});

test("errorDetail limits output to name, message, and code", () => {
  const detail = errorDetail(
    Object.assign(new Error("failure"), { code: "INTERNAL", extra: "secret" }),
  );
  assert.deepEqual(detail, {
    name: "Error",
    message: "failure",
    code: "INTERNAL",
  });
});
