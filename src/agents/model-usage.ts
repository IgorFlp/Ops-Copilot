import type { ModelTokenUsage } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTokenCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

export function extractPromptTokens(response: unknown): number | undefined {
  if (!isRecord(response)) return undefined;
  const raw = isRecord(response.raw) ? response.raw : response;
  const usage = isRecord(raw.usage_metadata) ? raw.usage_metadata : undefined;
  if (usage && "input_tokens" in usage) {
    return validTokenCount(usage.input_tokens)
      ? usage.input_tokens
      : undefined;
  }

  const metadata = isRecord(raw.response_metadata)
    ? raw.response_metadata
    : undefined;
  const tokenUsage =
    metadata && isRecord(metadata.tokenUsage)
      ? metadata.tokenUsage
      : undefined;
  return tokenUsage && validTokenCount(tokenUsage.promptTokens)
    ? tokenUsage.promptTokens
    : undefined;
}

export function aggregateModelUsage(
  promptTokenCounts: readonly (number | undefined)[],
): ModelTokenUsage | undefined {
  if (promptTokenCounts.length === 0) return undefined;
  if (promptTokenCounts.some((count) => !validTokenCount(count))) {
    return { modelCalls: promptTokenCounts.length };
  }
  let promptTokens = 0;
  for (const count of promptTokenCounts) {
    if (validTokenCount(count)) promptTokens += count;
  }
  if (!Number.isSafeInteger(promptTokens)) {
    return { modelCalls: promptTokenCounts.length };
  }
  return { modelCalls: promptTokenCounts.length, promptTokens };
}

export function combineModelUsage(
  ...usages: readonly (ModelTokenUsage | undefined)[]
): ModelTokenUsage | undefined {
  const present = usages.filter(
    (usage): usage is ModelTokenUsage => usage !== undefined,
  );
  if (present.length === 0) return undefined;

  const modelCalls = present.reduce(
    (total, usage) => total + usage.modelCalls,
    0,
  );
  if (
    !Number.isSafeInteger(modelCalls) ||
    present.some((usage) => usage.promptTokens === undefined)
  ) {
    return { modelCalls };
  }

  let promptTokens = 0;
  for (const usage of present) {
    if (usage.promptTokens !== undefined) promptTokens += usage.promptTokens;
  }
  if (!Number.isSafeInteger(promptTokens)) return { modelCalls };
  return { modelCalls, promptTokens };
}

export function unknownModelUsage(
  modelCalls: number,
): ModelTokenUsage | undefined {
  if (modelCalls === 0) return undefined;
  return { modelCalls };
}
