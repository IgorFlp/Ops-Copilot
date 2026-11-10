const REDACTED = "[redacted]";

const FORBIDDEN_KEYS = new Set([
  "message",
  "content",
  "answer",
  "prompt",
  "prompts",
  "toolArgs",
  "args",
  "facts",
  "memoryFacts",
  "summary",
  "secret",
  "secrets",
  "password",
  "apiKey",
  "authorization",
  "token",
  "accessToken",
]);

export function errorDetail(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const detail: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    if ("code" in error && typeof error.code === "string") {
      detail.code = error.code;
    }
    return detail;
  }
  if (typeof error === "object" && error !== null) {
    return { message: String(error) };
  }
  return { message: String(error) };
}

function sanitize(
  value: unknown,
  parentKey: string | undefined,
  seen: WeakSet<object>,
): unknown {
  if (value instanceof Error) {
    return errorDetail(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    return value.map((item) => sanitize(item, parentKey, seen));
  }
  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      if (
        FORBIDDEN_KEYS.has(key) &&
        !(parentKey === "error" && key === "message")
      ) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = sanitize(item, key, seen);
    }
    return result;
  }
  return value;
}

export function logEvent(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEYS.has(key)) {
      sanitized[key] = REDACTED;
      continue;
    }
    sanitized[key] = sanitize(value, key, new WeakSet());
  }

  const payload = {
    timestamp: new Date().toISOString(),
    event,
    ...sanitized,
  };

  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      logError: "serialization_failed",
    });
  }
  process.stderr.write(`${line}\n`);
}
