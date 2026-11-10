---
description: "Task list for Model Resilience feature implementation"
---

# Tasks: Model Resilience

**Input**: Design documents from `/specs/014-model-resilience/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per quickstart.md validation scenarios

**Organization**: Tasks grouped by user story to enable independent implementation and testing

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project structure per plan.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Verify project structure matches plan.md (src/agents/, src/errors/, src/middleware/, src/services/)
- [x] T002 [P] Verify TypeScript configuration supports strict mode and ESM (tsconfig.json)
- [x] T003 [P] Verify test infrastructure (node:test via tsx) works with existing tests

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

### DomainError Extension for MODEL_UNAVAILABLE

- [x] T004 Add "MODEL_UNAVAILABLE" to DomainErrorCode type in src/errors/domain-error.ts
- [x] T005 Update error-handler.ts to map "MODEL_UNAVAILABLE" to HTTP 503 status

### Type System Extensions (src/agents/types.ts)

- [x] T006 [P] Add "fallback" to TraceEventType union in src/agents/types.ts
- [x] T007 [P] Extend ModelTokenUsage interface with modelUsed, fallbackCount, totalLatencyMs in src/agents/types.ts
- [x] T008 [P] Export FallbackTraceEvent interface from src/agents/types.ts (re-export from model.resilience.ts)

### Configuration Loading & Validation

- [x] T009 Create Zod schema for RetryConfig in src/agents/model.resilience.ts (maxAttempts >= 1, baseDelayMs > 0, maxDelayMs >= baseDelayMs, backoffMultiplier >= 1.0, retryableStatusCodes array of ints 100-599)
- [x] T010 Create Zod schema for ModelConfiguration in src/agents/model.resilience.ts (primaryModel non-empty string, fallbackModels array of non-empty strings, no duplicates, primary not in fallbacks)
- [x] T011 Implement loadModelConfiguration() function in src/agents/model.resilience.ts per data-model.md (reads OPENROUTER_MODEL, OPENROUTER_MODEL_FALLBACK, applies defaults)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Primary Model with Retry (Priority: P1) — MVP

**Goal**: Implement retry logic with exponential backoff for the primary model (OPENROUTER_MODEL)

**Independent Test**: Configure only OPENROUTER_MODEL; verify transient errors (5xx, timeout, 429) trigger retries up to maxAttempts (default 3) before giving up; non-retryable errors (4xx except 429) fail fast

### Tests for User Story 1

- [x] T012 [P] [US1] Create test file src/agents/model.resilience.test.ts with test suite for retry logic
- [x] T013 [P] [US1] Test: primary model succeeds on first attempt
- [x] T014 [P] [US1] Test: primary model succeeds on retry (attempt 2) after transient error
- [x] T015 [P] [US1] Test: primary model exhausts retries (3 attempts) then fails with last error
- [x] T016 [P] [US1] Test: non-retryable error (401 AuthenticationError) fails immediately without retry
- [x] T017 [P] [US1] Test: retryable error (429 RateLimitError) triggers retry with exponential backoff
- [x] T018 [P] [US1] Test: retryable error (500 InternalServerError) triggers retry with exponential backoff
- [x] T019 [P] [US1] Test: retryable error (APITimeoutError) triggers retry with exponential backoff
- [x] T020 [P] [US1] Test: retryable error (APIConnectionError) triggers retry with exponential backoff
- [x] T021 [P] [US1] Test: exponential backoff delay calculation (1000ms, 2000ms, 4000ms with jitter ±25%)
- [x] T022 [P] [US1] Test: maxDelayMs cap respected (10000ms default)

### Implementation for User Story 1

- [x] T023 [US1] Create src/agents/model.resilience.ts with RetryableModel pattern implementing retry logic (withRetry/withFallback)
- [x] T024 [US1] Implement isRetryableError() function in src/agents/model.resilience.ts using LangChain error classes (APIConnectionError, APITimeoutError, RateLimitError, InternalServerError, APIError with status >= 500)
- [x] T025 [US1] Implement executeWithRetry() function in src/agents/model.resilience.ts (takes modelId, ChatOpenAI instance, input, retryConfig; returns ModelAttempt[] and result/error)
- [x] T026 [US1] Implement delay calculation with exponential backoff and jitter in src/agents/model.resilience.ts
- [x] T027 [US1] Add createResilientModel() function to src/agents/model.ts that returns RetryableModel instance
- [x] T028 [US1] Update src/agents/model.ts exports to include createResilientModel, loadModelConfiguration, types
- [x] T029 [US1] Update src/agents/index.ts to re-export createResilientModel, loadModelConfiguration

**Checkpoint**: User Story 1 complete - primary model with retry works independently

---

## Phase 4: User Story 2 - Fallback to Reserve Models (Priority: P1)

**Goal**: Implement fallback chain to reserve models (OPENROUTER_MODEL_FALLBACK) when primary fails after retries

**Independent Test**: Configure OPENROUTER_MODEL_FALLBACK with multiple models; simulate primary failure; verify fallback chain executes in order until one succeeds

### Tests for User Story 2

- [x] T030 [P] [US2] Test: primary fails after retries, first fallback succeeds
- [x] T031 [P] [US2] Test: first fallback fails, second fallback succeeds
- [x] T032 [P] [US2] Test: all fallbacks fail → throws MODEL_UNAVAILABLE (503)
- [x] T033 [P] [US2] Test: fallback models tried in order specified in OPENROUTER_MODEL_FALLBACK
- [x] T034 [P] [US2] Test: empty OPENROUTER_MODEL_FALLBACK works with primary only (no fallback chain)
- [x] T035 [P] [US2] Test: duplicate model IDs in fallback list deduplicated (first occurrence kept)
- [x] T036 [P] [US2] Test: primary model removed from fallback list if duplicated
- [x] T037 [P] [US2] Test: invalid model name in fallback list skipped with warning, next model tried
- [x] T038 [P] [US2] Test: fallback models use same parameters as primary (temperature: 0, maxTokens from options)
- [x] T039 [P] [US2] Test: fallback retry config uses default (maxAttempts: 1, baseDelayMs: 500)

### Implementation for User Story 2

- [x] T040 [US2] Implement fallback chain logic in createFallbackModel() in src/agents/model.resilience.ts
- [x] T041 [US2] Implement createChatOpenAIInstance() helper in src/agents/model.resilience.ts (creates ChatOpenAI with modelId, apiKey, baseURL, temperature: 0, maxTokens)
- [x] T042 [US2] Add fallback chain logic to createResilientModel() in src/agents/model.ts
- [x] T043 [US2] Handle MODEL_UNAVAILABLE error when all models exhausted (throw DomainError with code "MODEL_UNAVAILABLE", statusCode 503)
- [x] T044 [US2] Add warning log for skipped invalid fallback models (using lib/log.js)

**Checkpoint**: User Story 2 complete - fallback chain works independently

---

## Phase 5: User Story 3 - Trace Fallback Events and Model Usage (Priority: P2)

**Goal**: Emit "fallback" trace events on model switch and record modelUsed/fallbackCount/totalLatencyMs in metrics

**Independent Test**: Inspect trace output and metrics when fallback occurs; verify "fallback" event with fromModel/toModel/reason/attemptSummary; verify modelUsed metric identifies successful model

### Tests for User Story 3

- [x] T045 [P] [US3] Test: fallback from primary to reserve emits "fallback" trace event with fromModel, toModel, reason, attemptSummary
- [x] T046 [P] [US3] Test: fallback event reason = "retry_exhausted" when primary retries exhausted
- [x] T047 [P] [US3] Test: fallback event reason = "non_retryable_error" when primary fails with non-retryable error
- [x] T048 [P] [US3] Test: fallback event reason = "invalid_model" when fallback model ID invalid
- [x] T049 [P] [US3] Test: multiple fallbacks produce multiple "fallback" events in order
- [x] T050 [P] [US3] Test: trace events integrate with AttributedTraceEvent structure (have node field)
- [x] T051 [P] [US3] Test: modelUsed metric = primary model when primary succeeds
- [x] T052 [P] [US3] Test: modelUsed metric = fallback model when fallback succeeds
- [x] T053 [P] [US3] Test: fallbackCount = 0 when primary succeeds
- [x] T054 [P] [US3] Test: fallbackCount = N when N fallbacks occurred
- [x] T055 [P] [US3] Test: totalLatencyMs includes all attempt latencies across all models
- [x] T056 [P] [US3] Test: primaryModelLatencyMs tracks time spent on primary model only

### Implementation for User Story 3

- [x] T057 [US3] Implement createFallbackTraceEvent() function in src/agents/model.resilience.ts per contracts/trace-events.ts
- [x] T058 [US3] Emit fallback trace event in executeWithFallbacks() after each model switch
- [x] T059 [US3] Return traceEvents array from ResilientModel.invoke() alongside result
- [x] T060 [US3] Return ModelMetrics (modelUsed, fallbackCount, totalLatencyMs, attempts, primaryModelLatencyMs) from invoke()
- [x] T061 [US3] Update production-graph.ts to merge model trace events into GraphState.trace (in strategy nodes)
- [x] T062 [US3] Update production-graph.ts to merge model metrics into GraphState.metrics.tokenUsage (modelUsed, fallbackCount, totalLatencyMs)
- [x] T063 [US3] Update combineModelUsage() in src/agents/model-usage.ts to preserve extended fields (modelUsed, fallbackCount, totalLatencyMs) when combining
- [x] T064 [US3] Update chat-service.ts to include model trace events and metrics in final ChatServiceResult

**Checkpoint**: User Story 3 complete - trace events and metrics work independently

---

## Phase 6: User Story 4 - 503 Error When All Models Fail (Priority: P1)

**Goal**: Return HTTP 503 Service Unavailable when primary and all fallback models fail

**Independent Test**: Configure all invalid models; verify DomainError thrown with code "MODEL_UNAVAILABLE", statusCode 503; error handler returns HTTP 503

### Tests for User Story 4

- [x] T065 [P] [US4] Test: all models fail → throws DomainError with code "MODEL_UNAVAILABLE", statusCode 503
- [x] T066 [P] [US4] Test: no fallback configured, primary fails after retries → throws MODEL_UNAVAILABLE (503)
- [x] T067 [P] [US4] Test: error message "All configured models unavailable" (no internal details exposed)
- [x] T068 [P] [US4] Test: error handler middleware returns HTTP 503 for MODEL_UNAVAILABLE
- [x] T069 [P] [US4] Test: response body { "error": "All configured models unavailable" }
- [x] T070 [P] [US4] Test: 503 returned within 30 seconds when all models unavailable

### Implementation for User Story 4

- [x] T071 [US4] Verify DomainError handling in src/middleware/error-handler.ts maps "MODEL_UNAVAILABLE" to 503 (from T005)
- [x] T072 [US4] Ensure error thrown from executeWithFallbacks() includes all model attempts in error context for debugging
- [x] T073 [US4] Add timeout protection for entire fallback chain (30s max) in ResilientModel.invoke()

**Checkpoint**: User Story 4 complete - 503 error handling works independently

---

## Phase 7: Integration & End-to-End Validation

**Purpose**: Verify all user stories work together via chat API

### Integration Tests

- [ ] T074 [P] [Integration] Test: full chat request with primary model only → 200 OK, trace has no fallback, modelUsed = primary
- [ ] T075 [P] [Integration] Test: full chat request with fallback chain → 200 OK, trace has fallback events, modelUsed = fallback
- [ ] T076 [P] [Integration] Test: full chat request with all models failing → 503, MODEL_UNAVAILABLE
- [ ] T077 [P] [Integration] Test: trace includes context, route, strategy, answer nodes plus fallback events
- [ ] T078 [P] [Integration] Test: metrics include calls, latencyMs, tokenUsage with modelUsed, fallbackCount, totalLatencyMs

### TypeScript & Full Suite

- [x] T079 Run npm run typecheck — verify no type errors
- [ ] T080 Run npm test — verify all existing tests pass + new resilience tests pass

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories

- [ ] T081 [P] Add JSDoc comments to public APIs in src/agents/model.resilience.ts
- [ ] T082 [P] Add JSDoc comments to extended types in src/agents/types.ts
- [ ] T083 [P] Update quickstart.md if any validation commands changed
- [ ] T084 Run quickstart.md Scenario 1-7 validation manually
- [ ] T085 [P] Performance check: fallback transition overhead < 2s (excluding model latency)
- [ ] T086 [P] Verify zero unhandled exceptions in fallback chain (error boundaries)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Phase 3): Can start after Foundational - No dependencies on other stories
  - US2 (Phase 4): Depends on US1 (uses ResilientModel from US1)
  - US3 (Phase 5): Depends on US1+US2 (adds trace/metrics to ResilientModel)
  - US4 (Phase 6): Depends on US1+US2 (error handling on exhausted chain)
- **Integration (Phase 7)**: Depends on all user stories complete
- **Polish (Phase 8)**: Depends on Integration validation

### User Story Dependencies

- **User Story 1 (P1)**: Foundation → **MVP** — Can deploy after this
- **User Story 2 (P1)**: Foundation + US1 — Adds fallback chain
- **User Story 3 (P2)**: Foundation + US1 + US2 — Adds observability
- **User Story 4 (P1)**: Foundation + US1 + US2 — Adds error handling (partially in Foundational)

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Core logic before integration points
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- All tests within a user story marked [P] can run in parallel
- Once Foundational phase completes, US1 can start; US2-4 wait for their dependencies
- Different developers can work on different stories once dependencies met

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "T013 [P] [US1] Test: primary model succeeds on first attempt"
Task: "T014 [P] [US1] Test: primary model succeeds on retry (attempt 2)"
Task: "T015 [P] [US1] Test: primary model exhausts retries"
Task: "T016 [P] [US1] Test: non-retryable error fails immediately"
Task: "T017 [P] [US1] Test: retryable error (429) triggers retry"
Task: "T018 [P] [US1] Test: retryable error (500) triggers retry"
Task: "T019 [P] [US1] Test: retryable error (timeout) triggers retry"
Task: "T020 [P] [US1] Test: retryable error (connection) triggers retry"
Task: "T021 [P] [US1] Test: exponential backoff delay calculation"
Task: "T022 [P] [US1] Test: maxDelayMs cap respected"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Primary Model with Retry)
4. **STOP and VALIDATE**: Test User Story 1 independently via quickstart.md Scenario 1
5. Deploy/demo if ready — **This is the MVP!**

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (P1)
   - Developer B: User Story 2 (P1) — waits for US1 ResilientModel
   - Developer C: User Story 3 (P2) — waits for US1+US2
   - Developer D: User Story 4 (P1) — waits for US1+US2
3. Stories complete and integrate independently

---

## Task Summary

| Phase | Tasks | User Stories |
|-------|-------|--------------|
| 1: Setup | 3 | — |
| 2: Foundational | 8 | — |
| 3: US1 (P1) | 18 | Primary Model with Retry |
| 4: US2 (P1) | 10 | Fallback to Reserve Models |
| 5: US3 (P2) | 12 | Trace Events & Metrics |
| 6: US4 (P1) | 4 | 503 Error Handling |
| 7: Integration | 6 | End-to-End |
| 8: Polish | 6 | Cross-Cutting |
| **Total** | **67** | **4 stories** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD per quickstart.md)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence