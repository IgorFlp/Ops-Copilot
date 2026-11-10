# Quickstart: Model Resilience Validation

**Feature**: Model Resilience (specs/014-model-resilience)
**Date**: 2026-11-09

---

## Prerequisites

- Node.js 22 LTS
- Repository dependencies installed (`npm install`)
- OpenRouter API key (for integration tests)

### Environment Setup

Create `.env` file in project root:

```bash
# Required for all tests
OPENROUTER_API_KEY=your-api-key-here
OPENROUTER_MODEL=openai/gpt-4o-mini

# Optional: Enable fallback chain testing
# OPENROUTER_MODEL_FALLBACK=anthropic/claude-3-haiku,google/gemini-1.5-flash
```

---

## Validation Scenarios

### Scenario 1: Unit Tests - Retry Logic

**Purpose**: Verify retry behavior with mocked failures

```bash
# Run resilience unit tests
npm run test -- src/agents/model.resilience.test.ts
```

**Expected**:
- All tests pass
- Retry attempts logged with exponential backoff
- Non-retryable errors fail fast (no retry)
- Retryable errors retry up to `maxAttempts`

**Key Test Cases**:
- `primary model succeeds on first attempt`
- `primary model succeeds on retry (attempt 2)`
- `primary model exhausts retries then falls back`
- `non-retryable error (401) fails immediately`
- `fallback model succeeds after primary fails`
- `all models fail → throws MODEL_UNAVAILABLE (503)`

---

### Scenario 2: Unit Tests - Trace Events

**Purpose**: Verify "fallback" trace events emitted correctly

```bash
npm run test -- src/agents/model.resilience.test.ts -t "trace"
```

**Expected**:
- Each fallback emits one `type: "fallback"` event
- Event contains `fromModel`, `toModel`, `reason`, `attemptSummary`
- Multiple fallbacks produce multiple events in order
- Events integrate with existing `AttributedTraceEvent` structure

---

### Scenario 3: Unit Tests - Metrics

**Purpose**: Verify `modelUsed`, `fallbackCount`, `totalLatencyMs` in metrics

```bash
npm run test -- src/agents/model.resilience.test.ts -t "metrics"
```

**Expected**:
- `modelUsed` matches successful model
- `fallbackCount` = 0 when primary succeeds
- `fallbackCount` = N when N fallbacks occurred
- `totalLatencyMs` includes all attempt latencies

---

### Scenario 4: Integration Test - Chat API

**Purpose**: End-to-end verification via HTTP API

```bash
# Start dev server
npm run dev

# In another terminal, test chat endpoint
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List firing alerts"}'
```

**Expected Response** (JSON):
```json
{
  "answer": "...",
  "trace": [
    { "type": "context", "content": "...", "node": "context" },
    { "type": "route", "content": "...", "node": "route" },
    { "type": "action", "content": "...", "node": "react" },
    { "type": "answer", "content": "...", "node": "react" }
  ],
  "metrics": {
    "calls": 1,
    "latencyMs": 1234,
    "tokenUsage": {
      "modelCalls": 1,
      "modelUsed": "openai/gpt-4o-mini",
      "fallbackCount": 0,
      "totalLatencyMs": 1234
    }
  }
}
```

**With Fallback** (simulate primary failure by using invalid model):
```bash
# Temporarily override primary to invalid model
OPENROUTER_MODEL=invalid/model OPENROUTER_MODEL_FALLBACK=openai/gpt-4o-mini npm run dev
```

**Expected**: Response includes `fallback` trace event and `modelUsed` = fallback model

---

### Scenario 5: 503 Error Handling

**Purpose**: Verify HTTP 503 when all models unavailable

```bash
# Test with all invalid models
OPENROUTER_MODEL=invalid/primary OPENROUTER_MODEL_FALLBACK=invalid/fallback1,invalid/fallback2 npm run test -- src/agents/model.resilience.test.ts -t "all models fail"
```

**Expected**:
- `DomainError` thrown with `code: "MODEL_UNAVAILABLE"`, `statusCode: 503`
- Error handler middleware returns HTTP 503
- Response body: `{ "error": "All configured models unavailable" }` (no internal details)

---

### Scenario 6: TypeScript Compilation

**Purpose**: Verify no type errors

```bash
npm run typecheck
```

**Expected**: Exit code 0, no errors

---

### Scenario 7: Full Test Suite

**Purpose**: Ensure no regressions

```bash
npm test
```

**Expected**: All existing tests pass + new resilience tests pass

---

## Manual Verification Checklist

| Check | Command | Expected |
|-------|---------|----------|
| Primary model works | Scenario 4 | 200 OK, `modelUsed` = primary |
| Fallback chain works | Scenario 4 (with fallback) | 200 OK, `fallback` event present, `modelUsed` = fallback |
| 503 on total failure | Scenario 5 | 503 status, `MODEL_UNAVAILABLE` code |
| Trace includes fallback | Scenario 4 (with fallback) | `type: "fallback"` in trace array |
| Metrics include modelUsed | Scenario 4 | `tokenUsage.modelUsed` present |
| No unhandled exceptions | All scenarios | No crash, clean errors |

---

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| `OPENROUTER_API_KEY not set` | Add to `.env` file |
| `OPENROUTER_MODEL not set` | Add to `.env` file |
| Tests timeout | Increase test timeout in `model.resilience.test.ts` |
| 503 not returned | Check `error-handler.ts` maps `DomainError.statusCode` |
| Trace events missing | Verify `production-graph.ts` merges model trace events |

---

## References

- **Data Model**: `data-model.md` — entity definitions
- **Contracts**: `contracts/model-factory.ts`, `contracts/trace-events.ts` — TypeScript interfaces
- **Implementation Plan**: `plan.md` — technical approach
- **Source Code**: `src/agents/model.ts`, `src/agents/model.resilience.ts`, `src/agents/types.ts`