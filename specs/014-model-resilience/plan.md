# Implementation Plan: Model Resilience

**Branch**: `014-model-resilience` | **Date**: 2026-11-09 | **Spec**: specs/014-model-resilience/spec.md

**Input**: Feature specification from `/specs/014-model-resilience/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add model resilience to the OpenRouter model factory (`src/agents/model.ts`) by implementing:
- Retry logic with exponential backoff for the primary model (`OPENROUTER_MODEL`)
- Fallback chain to reserve models (`OPENROUTER_MODEL_FALLBACK`, comma-separated)
- Trace events for each fallback transition ("fallback" type with fromModel/toModel)
- Metrics recording the successful model (`modelUsed`)
- HTTP 503 when all models exhausted

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 22 LTS, ESM, strict mode)

**Primary Dependencies**: 
- `@langchain/openai` (ChatOpenAI for OpenRouter)
- `@langchain/core` (base message types)
- `zod` (validation)
- `express` (HTTP layer, for error handling)

**Storage**: N/A (no new persistence; uses existing SQLite for ops/conversations)

**Testing**: `node:test` via `tsx` (existing test infrastructure)

**Target Platform**: Linux server (Node.js 22 LTS)

**Project Type**: Web service (Express + LangGraph agents)

**Performance Goals**: 
- Fallback transition overhead < 2s (excluding model latency)
- 503 response within 30s when all models unavailable
- Zero unhandled exceptions in fallback chain

**Constraints**: 
- No `dotenv` package (use Node.js native `--env-file-if-exists`)
- Must follow MVC layer separation (model/service/controller)
- Domain errors via `DomainError` class
- Input validation via Zod at boundaries
- Existing trace/metrics structures in `src/agents/types.ts` must be used

**Scale/Scope**: 
- Single model factory enhancement
- Integration with existing reasoning strategies (react, plan-and-execute, reflect:react)
- Affects all agent execution paths that use `createModel()`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Explicit MVC Layers | ✅ PASS | Model factory in `src/agents/model.ts` (model layer); resilience logic stays in model factory; no HTTP deps |
| II. Validated External Boundaries | ✅ PASS | Env vars validated in factory; Zod for any new config schemas |
| III. Domain Errors | ✅ PASS | Use `DomainError` for configuration/operation failures; 503 via existing error handler |
| IV. Tested Changes | ✅ PASS | New tests via `node:test` + `tsx`; typecheck + test must pass |
| V. Security, Simplicity, Spec-First | ✅ PASS | No secrets in code; native env loading; pure functions preferred; spec exists |

**Gate Result**: PASS — proceed to Phase 0

---

## Phase 0: Research — COMPLETE ✅

*Generated `research.md` resolving all NEEDS CLARIFICATION from spec assumptions.*

### Research Tasks — All Complete

1. **Retry/backoff strategy for `@langchain/openai` ChatOpenAI** — Custom wrapper with exponential backoff (see research.md)
2. **Error classification for retryable vs non-retryable** — LangChain error classes + status codes (see research.md)
3. **Trace event integration** — Add "fallback" to TraceEventType, emit FallbackTraceEvent (see research.md)
4. **Metrics integration** — Extend ModelTokenUsage with modelUsed, fallbackCount, totalLatencyMs (see research.md)
5. **Fallback model instantiation** — Same parameters as primary (temperature 0, optional maxTokens)
6. **503 error propagation** — DomainError with code "MODEL_UNAVAILABLE", statusCode 503

---

## Phase 1: Design & Contracts — COMPLETE ✅

*Prerequisites: `research.md` complete*

### 1. Data Model (`data-model.md`) — COMPLETE

Entities defined:
- **ModelConfiguration**: primaryModel, fallbackModels, retryConfig, fallbackRetryConfig
- **RetryConfig**: maxAttempts, baseDelayMs, maxDelayMs, backoffMultiplier, retryableStatusCodes
- **ModelAttempt**: modelId, attemptNumber, startTime, endTime, latencyMs, success, error, retryable
- **FallbackEvent**: type, timestamp, fromModel, toModel, reason, attemptSummary
- **ModelMetrics**: modelUsed, fallbackCount, totalLatencyMs, attempts, primaryModelLatencyMs

Validation rules and configuration loading documented.

### 2. Contracts (`contracts/`) — COMPLETE

Internal TypeScript interfaces:
- `contracts/model-factory.ts` — ModelFactory, ResilientModelFactory, ResilientModel, ModelAttempt, RetryConfig
- `contracts/trace-events.ts` — ExtendedTraceEventType, FallbackTraceEvent, ExtendedModelTokenUsage, factory functions

### 3. Quickstart Validation (`quickstart.md`) — COMPLETE

7 validation scenarios covering:
- Unit tests: retry logic, trace events, metrics
- Integration: chat API with/without fallback
- Error handling: 503 when all models fail
- TypeScript compilation
- Full test suite regression check

---

## Post-Design Constitution Check — RE-EVALUATED ✅

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Explicit MVC Layers | ✅ PASS | Resilience logic in `model.resilience.ts` (model layer); `model.ts` factory unchanged for consumers |
| II. Validated External Boundaries | ✅ PASS | Config loaded in factory with validation; Zod schemas in contracts for future API boundaries |
| III. Domain Errors | ✅ PASS | `MODEL_UNAVAILABLE` DomainError with 503; existing error handler maps correctly |
| IV. Tested Changes | ✅ PASS | Unit test patterns defined in quickstart; integration test via chat API |
| V. Security, Simplicity, Spec-First | ✅ PASS | No secrets; native env; pure functions in resilience module; spec-driven design |

**Gate Result**: PASS — ready for Phase 2 (`/speckit-tasks`)