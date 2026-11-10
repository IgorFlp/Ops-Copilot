# Research: Model Resilience

**Feature**: Model Resilience (specs/014-model-resilience)
**Date**: 2026-11-09

---

## 1. Retry/Backoff Strategy for `@langchain/openai` ChatOpenAI

### Findings

**ChatOpenAI Built-in Retry**: 
- `@langchain/openai` uses `OpenAI` client under the hood which has configurable retry via `maxRetries` option (default: 2)
- However, this is for the OpenAI SDK directly, not exposed cleanly through `ChatOpenAI` constructor
- `ChatOpenAI` accepts `maxRetries` in configuration but it's not well documented

**Error Types Thrown**:
- `APIError` (from OpenAI SDK) with `status` property for HTTP status codes
- `APIConnectionError` for network/timeout errors
- `RateLimitError` (extends APIError, status 429)
- `AuthenticationError` (status 401)
- `BadRequestError` (status 400)
- `InternalServerError` (status 500)
- `APITimeoutError` for timeouts

### Decision

**Custom wrapper with explicit retry logic** rather than relying on built-in:
- Gives full control over retry conditions (retryable vs non-retryable)
- Allows per-model retry configuration (primary vs fallbacks)
- Enables trace event emission on each retry attempt
- Compatible with existing `DomainError` pattern

### Rationale

- Built-in retry is opaque and doesn't distinguish error types we care about
- Need to emit "fallback" trace events only on model switch, not on retries
- Fallback models should have different retry policy (1 attempt vs 3 for primary)
- Custom wrapper keeps resilience logic testable and isolated

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Built-in `maxRetries` | Simple, no extra code | No error classification, no trace events, same policy for all models |
| LangChain callbacks (`onRetry`) | Hooks into existing flow | Still limited error classification, callback-based not promise-based |
| **Custom wrapper (chosen)** | Full control, testable, trace integration | More code to maintain |

---

## 2. Error Classification for Retryable vs Non-Retryable

### Findings

**OpenRouter API Error Patterns** (inherits from OpenAI-compatible API):
- **Retryable (5xx, 429, network)**: 500, 502, 503, 504, 429, ECONNRESET, ETIMEDOUT, ENOTFOUND
- **Non-retryable (4xx except 429)**: 400 (bad request), 401 (auth), 403 (forbidden), 404 (not found), 422 (validation)
- **Special case**: 408 (Request Timeout) — retryable

**LangChain Error Classes** (from `@langchain/core`):
```typescript
// All extend BaseError
APIError          // base, has .status
RateLimitError    // status 429
AuthenticationError // status 401
BadRequestError   // status 400
NotFoundError     // status 404
InternalServerError // status 500
APITimeoutError   // timeout
APIConnectionError // network
```

### Decision

**Retryable predicate function**:
```typescript
function isRetryableError(error: Error): boolean {
  if (error instanceof APIConnectionError) return true;
  if (error instanceof APITimeoutError) return true;
  if (error instanceof RateLimitError) return true;
  if (error instanceof InternalServerError) return true;
  if (error instanceof APIError && error.status >= 500) return true;
  return false;
}
```

### Rationale

- Covers all transient failure modes (network, timeout, rate limit, server errors)
- Explicitly excludes client errors (4xx) except 429
- Uses LangChain's typed error classes for reliability
- Extensible for future error types

---

## 3. Trace Event Integration

### Findings

**Current Trace Flow**:
1. `production-graph.ts` creates `GraphState` with `trace: AttributedTraceEvent[]`
2. Each node (`context`, `route`, `react`, `plan-and-execute`, `reflect:react`, `summary`) adds `AttributedTraceEvent`
3. `createAttributedEvent()` in `production-graph.ts` adds `node` field
4. Strategies (`react.ts`, `plan-and-execute.ts`) produce `TraceEvent[]` in results
5. `chat-service.ts` aggregates into final response

**TraceEventType** (in `types.ts`): `"thought" | "action" | "observation" | "plan" | "critique" | "answer" | "summarize" | "route" | "context"`

### Decision

**Add "fallback" to TraceEventType** and create `FallbackTraceEvent` interface:

```typescript
// In types.ts
export type TraceEventType = 
  | "thought" | "action" | "observation" | "plan" 
  | "critique" | "answer" | "summarize" | "route" 
  | "context" | "fallback";

export interface FallbackTraceEvent extends TraceEvent {
  type: "fallback";
  fromModel: string;
  toModel: string;
  reason: string;  // "retry_exhausted" | "non_retryable_error" | "invalid_model"
}
```

**Emission point**: In `model.resilience.ts` after each fallback, push to trace array passed via context or returned alongside result.

### Rationale

- Minimal change to existing trace infrastructure
- "fallback" event fits existing pattern (type + content + metadata)
- Includes all info needed for debugging: from/to models, reason
- Can be filtered/analyzed with existing trace tooling

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| Separate fallback log | Isolated | Not in main trace, harder to correlate |
| **Extend TraceEventType (chosen)** | Unified trace, existing tooling works | Slight type widening |

---

## 4. Metrics Integration

### Findings

**Current Metrics Flow**:
- `GraphState.metrics`: `{ calls, latencyMs, tokenUsage?: ModelTokenUsage }`
- `ModelTokenUsage`: `{ modelCalls, promptTokens? }`
- `ReasoningResult.metrics`: `ReasoningMetrics { calls, latencyMs }`
- `ReasoningResult.tokenUsage`: `ModelTokenUsage`
- Populated in `production-graph.ts`, `react.ts`, `plan-and-execute.ts`

### Decision

**Extend `ModelTokenUsage`** with resilience fields:

```typescript
// In types.ts
export interface ModelTokenUsage {
  modelCalls: number;
  promptTokens?: number;
  modelUsed?: string;        // NEW: model that ultimately succeeded
  fallbackCount?: number;    // NEW: number of fallback transitions
  totalLatencyMs?: number;   // NEW: end-to-end latency including fallbacks
}
```

**Population**: In `model.resilience.ts`, return metrics alongside model result; `chat-service.ts` merges into `GraphState.metrics.tokenUsage`.

### Rationale

- Reuses existing metrics structure (no new types)
- `modelUsed` directly answers "which model worked?"
- `fallbackCount` enables alerting on frequent fallbacks
- `totalLatencyMs` captures resilience overhead

---

## 5. Fallback Model Instantiation

### Findings

**ChatOpenAI Constructor Options**:
```typescript
new ChatOpenAI({
  model: string,           // model identifier
  apiKey: string,
  configuration: { baseURL: string },
  temperature: number,
  maxTokens?: number,
  maxRetries?: number,     // built-in retry
  timeout?: number,        // request timeout
  // ... other OpenAI params
})
```

**Current `createModel()`** (in `model.ts`):
- Uses `OPENROUTER_MODEL` env var
- Fixed `temperature: 0`
- Optional `maxTokens` from options
- Fixed baseURL for OpenRouter

### Decision

**Same parameters for all models** (primary + fallbacks):
- Reuse `temperature: 0`, `maxTokens` from options
- Each fallback gets fresh `ChatOpenAI` instance with its model ID
- No per-model config in MVP (can add later via env prefix if needed)

### Rationale

- Simplicity: single config source, predictable behavior
- Temperature 0 is correct for deterministic agent reasoning
- Per-model config adds complexity (env parsing, validation) with low immediate value
- Can extend later with `OPENROUTER_MODEL_FALLBACK_CONFIG` if needed

---

## 6. 503 Error Propagation

### Findings

**Current Error Handler** (`src/middleware/error-handler.ts`):
- Catches `DomainError` and maps to HTTP responses
- `DomainError` has `code` (string) and `statusCode` (number)
- Unknown errors → 500

**DomainError Usage**:
```typescript
throw new DomainError(message, "CODE", statusCode);
```

### Decision

**Throw `DomainError` with 503** when all models exhausted:

```typescript
// In model.resilience.ts
throw new DomainError(
  "All configured models unavailable",
  "MODEL_UNAVAILABLE",
  503
);
```

**Error handler** already maps `DomainError.statusCode` to HTTP status.

### Rationale

- Leverages existing error handling infrastructure
- 503 is semantically correct (service temporarily unavailable)
- `MODEL_UNAVAILABLE` code enables client-side handling
- No middleware changes needed

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| Retry implementation | Custom wrapper with exponential backoff |
| Retryable errors | 5xx, 429, network, timeout (via LangChain error classes) |
| Trace events | Add "fallback" to `TraceEventType`, emit `FallbackTraceEvent` |
| Metrics | Extend `ModelTokenUsage` with `modelUsed`, `fallbackCount`, `totalLatencyMs` |
| Fallback config | Same parameters as primary (temperature 0, optional maxTokens) |
| 503 error | `DomainError` with code "MODEL_UNAVAILABLE", statusCode 503 |
| File structure | New `model.resilience.ts` + extend `model.ts` + extend `types.ts` |

---

## Next Steps

1. **Phase 1**: Create `data-model.md` with entity definitions
2. **Phase 1**: Create `contracts/` with TypeScript interfaces
3. **Phase 1**: Create `quickstart.md` with validation scenarios
4. **Phase 2**: Generate `tasks.md` for implementation