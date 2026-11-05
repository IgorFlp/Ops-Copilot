# Tasks: Context Token Metrics

**Input**: Design documents from `specs/010-context-token-metrics/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/chat-api.yaml`, `quickstart.md`

**Tests**: Included because FR-007 explicitly requires automated coverage.

**Organization**: Tasks are grouped by user story after shared setup and
foundational model-usage support.

## Phase 1: Setup

**Purpose**: Verify the existing project setup supports the planned work.

- [X] T001 [P] Verify the existing Node.js, LangChain, and test-script configuration in `package.json` supports the feature without adding dependencies.

---

## Phase 2: Foundational

**Purpose**: Define a shared, provider-neutral way to read and aggregate actual
model usage before implementing individual strategies.

- [X] T002 [P] Add unit tests for normalized and provider-specific usage metadata, invalid or missing counts, zero usage, and incomplete aggregates in `src/agents/model-usage.test.ts`.
- [X] T003 Implement validated prompt-usage extraction and complete/incomplete aggregation in `src/agents/model-usage.ts`, and define the internal usage summary type in `src/agents/types.ts` without adding internal completeness fields to public metrics.

**Checkpoint**: Shared usage accounting is ready for strategy implementations.

---

## Phase 3: User Story 1 - Inspect prompt usage and context sources (Priority: P1) 🎯 MVP

**Goal**: Return per-source estimates and complete actual prompt usage in chat
metrics, without presenting estimates or partial provider totals as actual.

**Independent Test**: Exercise `/chat` with deterministic strategy/model
fixtures. Verify each included input source has the documented estimate, the
actual count sums every reported model invocation, and the actual field is
omitted if any invocation has no valid usage.

### Tests for User Story 1

- [X] T004 [P] [US1] Add estimator tests for four-code-point rounding, empty and short text, and supplementary Unicode characters in `src/context/tokens.test.ts`.
- [X] T005 [P] [US1] Add chat-service tests for current-message, concatenated history, and recalled-memory estimates, omitted absent sources, actual usage propagation, and no fabricated usage in `src/services/chat-service.test.ts`.
- [X] T006 [P] [US1] Add ReAct tests that sum usage from every returned AI message and omit the total when any model response lacks usage in `src/agents/react.test.ts`.
- [X] T007 [P] [US1] Add plan-and-execute tests for usage from raw structured outputs, retries, and multiple graph stages, including incomplete usage in `src/agents/plan-and-execute.test.ts`.
- [X] T008 [P] [US1] Add reflection tests for combining strategy and critic usage across retries and omitting the total when any invocation lacks usage in `src/agents/reflection.test.ts`.
- [X] T009 [P] [US1] Add HTTP chat assertions for the required context breakdown and optional actual prompt-token field in `src/controllers/chat-controller.test.ts`.
- [X] T010 [P] [US1] Add an arena-service regression test asserting internal token-usage bookkeeping does not appear in arena results in `src/services/arena-service.test.ts`.

### Implementation for User Story 1

- [X] T011 [P] [US1] Implement the pure character estimator using Unicode code points and `floor(count / 4)` in `src/context/tokens.ts`.
- [X] T012 [US1] Aggregate prompt usage across all ReAct AI messages, omitting it when an invocation lacks valid usage, in `src/agents/react.ts`.
- [X] T013 [US1] Carry usage from every raw structured model response and retry through the plan graph, omitting incomplete totals, in `src/agents/plan-and-execute.ts`.
- [X] T014 [US1] Capture actual usage from each reflection critic call and combine it with all strategy-run usage in `src/agents/reflection.ts`.
- [X] T015 [US1] Add the per-source estimates in `metrics.contextBreakdown`, expose only complete strategy usage as `metrics.promptTokens`, and keep internal usage bookkeeping out of the `/chat` response in `src/services/chat-service.ts`.
- [X] T016 [P] [US1] Keep internal token-usage bookkeeping out of public arena results in `src/services/arena-service.ts`.
- [X] T017 [P] [US1] Update the `POST /chat` metrics schema to require `contextBreakdown` and allow only a non-negative, optional, actual `promptTokens` value in `specs/010-context-token-metrics/contracts/chat-api.yaml`.

**Checkpoint**: User Story 1 works independently and preserves existing chat
answer, trace, call-count, and latency behavior.

---

## Phase 4: User Story 2 - Track usage during a long conversation (Priority: P2)

**Goal**: Print each successful turn's actual prompt-token count or clearly
mark the count unavailable, without substituting a text estimate.

**Independent Test**: Run the long-conversation script against a deterministic
test endpoint that returns known prompt counts and a response without usage.
Verify every successful turn prints its corresponding actual value or the
unavailable marker.

### Tests for User Story 2

- [X] T018 [P] [US2] Add a deterministic script test that checks per-turn actual prompt counts, an unavailable usage marker, and failure handling in `scripts/conversa-longa.test.ts`.

### Implementation for User Story 2

- [X] T019 [US2] Ensure each successful turn prints only `.metrics.promptTokens` or an explicit unavailable marker, preserving the existing untracked script contents and estimated request/response labels in `scripts/conversa-longa.sh`.

**Checkpoint**: User Story 2 can be verified independently using the controlled
endpoint fixture.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Keep the validation guide aligned with the contract and run the
project's required checks.

- [X] T020 [P] Update the focused test commands and expected metric behaviors to match the implemented contract in `specs/010-context-token-metrics/quickstart.md`.
- [X] T021 Run the focused feature tests, `npm run typecheck`, and `npm test` from the scripts in `package.json`; resolve any regressions in affected files under `src/` and `scripts/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; confirm the existing runtime and test configuration.
- **Foundational (Phase 2)**: Depends on setup; T003 depends on T002 and blocks strategy usage aggregation.
- **User Story 1 (Phase 3)**: Depends on the foundational usage summary. Its estimator tests and implementation are independent of strategy usage tests; API contract work can proceed separately from implementation.
- **User Story 2 (Phase 4)**: Depends on the response metric contract from User Story 1 for an end-to-end integration, but its deterministic script test can be authored independently.
- **Polish (Phase 5)**: Depends on the desired stories being implemented.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; delivers API diagnostics and is the MVP.
- **User Story 2 (P2)**: The script behavior can be implemented independently after Phase 2; the full end-to-end scenario additionally requires User Story 1's `/chat` metrics.

### Task Dependency Graph

```text
T001 -> T002 -> T003
T003 -> T005, T006, T007, T008, T009, T010
T004 -> T011
T006 -> T012
T007 -> T013
T008 -> T014
T005, T009, T011, T012, T013, T014 -> T015
T010 -> T016
T015, T018 -> T019
T015, T016, T017, T019 -> T020 -> T021
```

T016 may be authored in parallel with User Story 1; full endpoint-backed
validation of User Story 2 follows completion of T014.

### Parallel Opportunities

- **Foundational**: T002 is the usage-test task; T004 can be authored alongside it because the estimator is independent of model usage.
- **User Story 1 tests**: After T003, T005-T009 edit separate test files and can be authored in parallel. T004 is independent and can also proceed in parallel.
- **User Story 1 implementation**: T010 and T015 touch independent files. T011, T012, and T013 touch distinct strategy files and can proceed in parallel after their corresponding tests and T003.
- **User Story 2**: T016 can be authored alongside User Story 1; T017 follows T016.
- **Polish**: T018 follows both stories; T019 is the final verification gate.

## Parallel Example: User Story 1

```text
After T003, author independent tests in parallel: T005 chat-service behavior
in `src/services/chat-service.test.ts`, T006 ReAct usage in
`src/agents/react.test.ts`, T007 plan-and-execute usage in
`src/agents/plan-and-execute.test.ts`, T008 reflection usage in
`src/agents/reflection.test.ts`, T009 HTTP metrics in
`src/controllers/chat-controller.test.ts`, and T010 arena compatibility in
`src/services/arena-service.test.ts`.

After those tests, implement separate strategy paths in parallel:
T012 ReAct aggregation in `src/agents/react.ts`, T013 plan-and-execute
aggregation in `src/agents/plan-and-execute.ts`, and T014 reflection
aggregation in `src/agents/reflection.ts`.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete setup and shared usage accounting (Phases 1-2).
2. Complete User Story 1 tests and implementation (Phase 3).
3. Validate context breakdown and complete/missing provider usage with
   deterministic tests before starting the long-conversation integration.

### Incremental Delivery

1. Deliver User Story 1 as the first independently testable increment.
2. Deliver User Story 2 with per-turn output coverage.
3. Update the quickstart and require focused tests, typecheck, and the full test
   suite to pass before completion.
