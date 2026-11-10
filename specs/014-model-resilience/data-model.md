# Data Model: Model Resilience

**Feature**: Model Resilience (specs/014-model-resilience)
**Date**: 2026-11-09

---

## Entities

### 1. ModelConfiguration

Represents the complete model configuration loaded from environment variables.

```typescript
interface ModelConfiguration {
  primaryModel: string;           // OPENROUTER_MODEL (required)
  fallbackModels: string[];       // OPENROUTER_MODEL_FALLBACK parsed (optional, default [])
  retryConfig: RetryConfig;       // Retry behavior for primary model
  fallbackRetryConfig: RetryConfig; // Retry behavior for fallback models (simpler)
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| primaryModel | string | Yes | Primary model identifier from `OPENROUTER_MODEL` |
| fallbackModels | string[] | No | Ordered list from `OPENROUTER_MODEL_FALLBACK` (comma-separated) |
| retryConfig | RetryConfig | Yes | Retry policy for primary model |
| fallbackRetryConfig | RetryConfig | Yes | Retry policy for fallback models |

**Validation Rules**:
- `primaryModel`: Non-empty string, must be valid OpenRouter model ID format
- `fallbackModels`: Array of non-empty strings; empty array if env var not set or empty
- Duplicate model IDs in fallback list: removed (first occurrence kept)
- `primaryModel` must not appear in `fallbackModels` (removed if present)

**Source**: Environment variables at process startup (not reloaded at runtime)

---

### 2. RetryConfig

Configuration for retry behavior with exponential backoff.

```typescript
interface RetryConfig {
  maxAttempts: number;        // Total attempts (initial + retries)
  baseDelayMs: number;        // Initial delay before first retry
  maxDelayMs: number;         // Cap on delay
  backoffMultiplier: number;  // Exponential multiplier (e.g., 2.0)
  retryableStatusCodes: number[]; // HTTP status codes to retry
}
```

**Fields**:
| Field | Type | Default (Primary) | Default (Fallback) | Description |
|-------|------|-------------------|-------------------|-------------|
| maxAttempts | number | 3 | 1 | Total attempts including first |
| baseDelayMs | number | 1000 | 500 | Initial delay in ms |
| maxDelayMs | number | 10000 | 5000 | Maximum delay cap |
| backoffMultiplier | number | 2.0 | 2.0 | Exponential factor |
| retryableStatusCodes | number[] | [429, 500, 502, 503, 504] | [429, 500, 502, 503, 504] | HTTP codes to retry |

**Validation Rules**:
- `maxAttempts`: Integer >= 1
- `baseDelayMs`: Integer > 0
- `maxDelayMs`: Integer >= `baseDelayMs`
- `backoffMultiplier`: Number >= 1.0
- `retryableStatusCodes`: Array of integers 100-599

**Delay Calculation**: `delay = min(baseDelayMs * backoffMultiplier^attempt, maxDelayMs)` with jitter (±25%)

---

### 3. ModelAttempt

Record of a single attempt to invoke a specific model.

```typescript
interface ModelAttempt {
  modelId: string;              // Model identifier attempted
  attemptNumber: number;        // 1-based attempt index
  startTime: string;            // ISO timestamp
  endTime?: string;             // ISO timestamp (if completed)
  latencyMs?: number;           // endTime - startTime
  success: boolean;             // Whether attempt succeeded
  error?: ModelAttemptError;    // Error details if failed
  retryable: boolean;           // Whether error was classified as retryable
}
```

```typescript
interface ModelAttemptError {
  name: string;                 // Error class name (e.g., "RateLimitError")
  message: string;              // Error message
  statusCode?: number;          // HTTP status if available
  code?: string;                // Error code if available
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| modelId | string | Yes | Model that was attempted |
| attemptNumber | number | Yes | 1 = initial, 2+ = retries |
| startTime | string | Yes | ISO 8601 timestamp |
| endTime | string | No | Set on completion |
| latencyMs | number | No | Duration in milliseconds |
| success | boolean | Yes | True if attempt returned a result |
| error | ModelAttemptError | No | Populated if success=false |
| retryable | boolean | Yes | Classification for retry logic |

**State Transitions**:
```
PENDING → IN_PROGRESS → SUCCESS
                    → FAILURE (retryable) → RETRY (if attempts remain)
                    → FAILURE (non-retryable) → ABORT
```

---

### 4. FallbackEvent

Trace event emitted when switching from one model to another.

```typescript
interface FallbackEvent {
  type: "fallback";             // Literal type discriminator
  timestamp: string;            // ISO 8601 timestamp
  fromModel: string;            // Model that failed
  toModel: string;              // Model being tried next
  reason: FallbackReason;       // Why the fallback occurred
  attemptSummary: ModelAttemptSummary; // Summary of failed attempts
}
```

```typescript
type FallbackReason = 
  | "retry_exhausted"           // Primary/fallback retries exhausted
  | "non_retryable_error"       // Error classified as non-retryable
  | "invalid_model"             // Model ID invalid or not found
  | "configuration_error";      // Missing API key, etc.
```

```typescript
interface ModelAttemptSummary {
  totalAttempts: number;
  lastError: ModelAttemptError | null;
  totalLatencyMs: number;
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | "fallback" | Yes | Discriminator for trace filtering |
| timestamp | string | Yes | When fallback occurred |
| fromModel | string | Yes | Previous model identifier |
| toModel | string | Yes | Next model identifier |
| reason | FallbackReason | Yes | Classification of fallback cause |
| attemptSummary | ModelAttemptSummary | Yes | Summary of failed model's attempts |

**Emission**: One event per model transition (primary→fallback1, fallback1→fallback2, etc.)

---

### 5. ModelMetrics

Aggregated metrics for a complete request (including all fallbacks).

```typescript
interface ModelMetrics {
  modelUsed: string;            // Model that ultimately succeeded
  fallbackCount: number;        // Number of fallback transitions (0 = primary succeeded)
  totalLatencyMs: number;       // End-to-end latency including all attempts
  attempts: ModelAttempt[];     // All attempts across all models
  primaryModelLatencyMs?: number; // Latency of primary model attempts only
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| modelUsed | string | Yes | Successful model identifier |
| fallbackCount | number | Yes | 0 if primary succeeded, N if N fallbacks occurred |
| totalLatencyMs | number | Yes | Total wall-clock time |
| attempts | ModelAttempt[] | Yes | Complete attempt history |
| primaryModelLatencyMs | number | No | Time spent on primary model only |

**Derived Metrics**:
- `fallbackRate = fallbackCount / totalRequests` (for monitoring)
- `primarySuccessRate = requestsWithFallbackCount0 / totalRequests`

---

## Relationships

```
ModelConfiguration (1) → contains → RetryConfig (2: primary + fallback)
ModelConfiguration (1) → contains → fallbackModels (N)

ResilientModelInvocation (1) → creates → ModelAttempt[] (N)
ResilientModelInvocation (1) → emits → FallbackEvent[] (0..N)
ResilientModelInvocation (1) → produces → ModelMetrics (1)

ModelAttempt (N) → belongs to → ModelMetrics (1)
FallbackEvent (N) → references → ModelAttempt (via attemptSummary)
```

---

## Configuration Loading

```typescript
function loadModelConfiguration(): ModelConfiguration {
  const primary = process.env.OPENROUTER_MODEL?.trim();
  if (!primary) throw new DomainError(...);
  
  const fallbackEnv = process.env.OPENROUTER_MODEL_FALLBACK?.trim() ?? "";
  const fallbacks = fallbackEnv
    .split(",")
    .map(m => m.trim())
    .filter(m => m.length > 0)
    .filter((m, i, arr) => arr.indexOf(m) === i) // dedupe
    .filter(m => m !== primary); // remove primary if duplicated
  
  return {
    primaryModel: primary,
    fallbackModels: fallbacks,
    retryConfig: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2.0,
      retryableStatusCodes: [429, 500, 502, 503, 504]
    },
    fallbackRetryConfig: {
      maxAttempts: 1,
      baseDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 2.0,
      retryableStatusCodes: [429, 500, 502, 503, 504]
    }
  };
}
```

---

## TypeScript Definitions Location

All interfaces defined in: `src/agents/model.resilience.ts` (internal) and re-exported from `src/agents/types.ts` (public trace/metrics types)