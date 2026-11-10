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
  return { message: String(error) };
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
}

export function logEvent(
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) parts.push(`${key}=${formatValue(value)}`);
  }
  process.stderr.write(
    `[opspilot] ${event}${parts.length > 0 ? ` ${parts.join(" ")}` : ""}\n`,
  );
}
