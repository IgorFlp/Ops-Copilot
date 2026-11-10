import type { AttributedTraceEvent } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";
import { getDefaultRequestStore } from "../store/default-request-store.js";
import type {
  RequestRecord,
  RequestStore,
  RequestTrace,
  TraceEventEntry,
} from "../store/request-store.js";

export interface RequestMetrics {
  calls?: number | null;
  latencyMs?: number | null;
  historyMessages?: number | null;
  promptTokens?: number | null;
  contextBreakdown?: Record<string, number> | null;
}

export interface RecordSuccessInput {
  requestId: string;
  userId: string;
  conversationId?: string | null;
  strategy?: string | null;
  model?: string | null;
  metrics: RequestMetrics;
  trace: readonly AttributedTraceEvent[];
  startedAt: string;
  completedAt?: string;
}

export interface RecordFailureInput {
  requestId: string;
  userId: string;
  conversationId?: string | null;
  strategy?: string | null;
  model?: string | null;
  errorCode: string;
  latencyMs?: number | null;
  trace?: readonly AttributedTraceEvent[];
  startedAt: string;
  completedAt?: string;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(`${field} is required`, "VALIDATION");
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError(`${field} must be a non-empty string`, "VALIDATION");
  }
  return value;
}

function optionalCount(
  value: number | null | undefined,
  field: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError(
      `${field} must be a non-negative safe integer`,
      "VALIDATION",
    );
  }
  return value;
}

function breakdownOrNull(
  value: Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (value === undefined || value === null) return null;
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value)) {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new DomainError(
        `contextBreakdown.${key} must be a non-negative safe integer`,
        "VALIDATION",
      );
    }
    result[key] = count;
  }
  return result;
}

function toTraceEntries(
  trace: readonly AttributedTraceEvent[] | undefined,
): TraceEventEntry[] {
  if (!trace || trace.length === 0) return [];
  return trace.map((event, position) => {
    if (typeof event.node !== "string" || event.node.trim().length === 0) {
      throw new DomainError("Trace event node is required", "VALIDATION");
    }
    if (typeof event.type !== "string" || event.type.trim().length === 0) {
      throw new DomainError("Trace event type is required", "VALIDATION");
    }
    const payload = event as unknown as Record<string, unknown>;
    try {
      JSON.stringify(payload);
    } catch {
      throw new DomainError(
        "Trace event payload must be JSON-serializable",
        "VALIDATION",
      );
    }
    return {
      position,
      node: event.node,
      type: event.type,
      payload,
    };
  });
}

function timestampOrNow(value: string | undefined): string {
  if (value === undefined) return new Date().toISOString();
  if (Number.isNaN(Date.parse(value))) {
    throw new DomainError("Timestamp must be an ISO-8601 value", "VALIDATION");
  }
  return value;
}

export class RequestTraceService {
  constructor(
    private readonly store: Pick<
      RequestStore,
      "saveRequest" | "getRequest"
    > = getDefaultRequestStore(),
  ) {}

  async recordSuccess(input: RecordSuccessInput): Promise<void> {
    const record: RequestRecord = {
      requestId: requiredString(input.requestId, "requestId"),
      userId: requiredString(input.userId, "userId"),
      conversationId: optionalString(input.conversationId, "conversationId"),
      strategy: optionalString(input.strategy, "strategy"),
      modelUsed: optionalString(input.model, "model"),
      status: "completed",
      errorCode: null,
      calls: optionalCount(input.metrics.calls, "calls"),
      latencyMs: optionalCount(input.metrics.latencyMs, "latencyMs"),
      historyMessages: optionalCount(
        input.metrics.historyMessages,
        "historyMessages",
      ),
      promptTokens: optionalCount(input.metrics.promptTokens, "promptTokens"),
      contextBreakdown: breakdownOrNull(input.metrics.contextBreakdown),
      startedAt: timestampOrNow(input.startedAt),
      completedAt: timestampOrNow(input.completedAt),
      createdAt: "",
    };
    await this.store.saveRequest(record, toTraceEntries(input.trace));
  }

  async recordFailure(input: RecordFailureInput): Promise<void> {
    const record: RequestRecord = {
      requestId: requiredString(input.requestId, "requestId"),
      userId: requiredString(input.userId, "userId"),
      conversationId: optionalString(input.conversationId, "conversationId"),
      strategy: optionalString(input.strategy, "strategy"),
      modelUsed: optionalString(input.model, "model"),
      status: "failed",
      errorCode: requiredString(input.errorCode, "errorCode"),
      calls: null,
      latencyMs: optionalCount(input.latencyMs, "latencyMs"),
      historyMessages: null,
      promptTokens: null,
      contextBreakdown: null,
      startedAt: timestampOrNow(input.startedAt),
      completedAt: timestampOrNow(input.completedAt),
      createdAt: "",
    };
    await this.store.saveRequest(record, toTraceEntries(input.trace));
  }

  async getRequest(requestId: string): Promise<RequestTrace | null> {
    return this.store.getRequest(requiredString(requestId, "requestId"));
  }
}

let defaultService: RequestTraceService | undefined;

export function getDefaultRequestTraceService(): RequestTraceService {
  defaultService ??= new RequestTraceService();
  return defaultService;
}

export function createRequestTraceService(
  store?: Pick<RequestStore, "saveRequest" | "getRequest">,
): RequestTraceService {
  return new RequestTraceService(store);
}
