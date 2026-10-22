---
description: "Implementation tasks for the Reflection Layer feature"
---

# Tasks: Reflection Layer

**Input**: Design documents from `/specs/002-reflection-layer/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/arena-api.yaml`, `quickstart.md`

**Tests**: Included because the project constitution and implementation plan require deterministic `node:test` coverage for new logic.

**Organization**: Tasks are grouped by the three user stories in `spec.md`. Each story has an independent validation criterion; arena integration depends on the completed reflection behavior.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different files and no dependency on incomplete tasks; safe to perform in parallel.
- **[Story]**: User story label mapped to `spec.md`.
- Every task includes its target file path.

## Phase 1: Setup

**Purpose**: The repository, TypeScript configuration, dependencies, and test runner already exist. No project initialization or dependency installation is needed for this feature.

## Phase 2: Foundational

**Purpose**: Define shared types used by the decorator, both base-strategy adapters, and arena variants.

- [x] T001 Extend `src/agents/types.ts` with the internal reflection context (feedback, prior observations, and completed state-changing actions), optional `StrategyRunOptions.maxReflection`, strategy names `reflect:react` and `reflect:plan-and-execute`, and an optional boolean `TraceEvent.approved` field.

**Checkpoint**: Shared interfaces are ready; no persistence or database migration is required.

## Phase 3: User Story 1 - Improve a strategy answer through reflection (Priority: P1) 🎯 MVP

**Goal**: Allow any reasoning strategy to be decorated with a same-model structured critic and bounded answer regeneration.

**Independent Test**: Use deterministic strategy and critic fixtures to verify that approval returns the current answer without regeneration, rejection retries with feedback, empty observations remain empty, and invalid limits or stage failures reject the run.

### Tests for User Story 1

- [x] T002 [P] [US1] Add deterministic unit tests in `src/agents/reflection.test.ts` for immediate approval, rejection followed by regeneration with critique feedback, empty observations, default limit 2, zero limit, out-of-range/non-integer limits, malformed critic output, and surfaced strategy/critic errors.

### Implementation for User Story 1

- [x] T003 [US1] Implement `withReflection(strategy, opts)` in `src/agents/reflection.ts`, using the configured model for a Zod-validated `{ approved: boolean, feedback: string }` critic, evaluating only trace observations, validating `maxReflection` as an integer from 0 through 100 with default 2, regenerating after rejection up to the limit, and propagating base, critic, parsing, and regeneration failures.

**Checkpoint**: A deterministic fixture can use the decorator independently of HTTP or database services.

## Phase 4: User Story 2 - Understand the critique and cost of a reflected run (Priority: P1)

**Goal**: Make each critic decision, total call count, complete elapsed time, prior evidence, and retry safety visible in the reflected result.

**Independent Test**: Reject a first candidate and approve a later candidate; verify ordered critique events with boolean decisions and feedback, complete call/latency metrics, preserved observations, and no repeat of an already completed state-changing action.

### Tests for User Story 2

- [x] T004 [US2] Extend deterministic reflection tests in `src/agents/reflection.test.ts` to assert one critique event per critic call, decision/feedback fields, chronological attempt traces, aggregate base-plus-critic call counts, complete-run latency, and the final allowed regeneration being returned without another critique.
- [x] T005 [P] [US2] Add retry-context regression tests in `src/agents/react.test.ts` and add duplicate-mutation guard tests in `src/agents/tools.test.ts`, verifying prior observations/feedback are retained and completed incident mutations are not executed again.
- [x] T006 [P] [US2] Add retry-context and completed-mutation regression tests in `src/agents/plan-and-execute.test.ts`, verifying prior observations and feedback are available on regeneration and a completed state-changing tool action is not executed again.

### Implementation for User Story 2

- [x] T007 [P] [US2] Update `src/agents/reflection.ts` to append each critic result as a chronological `critique` event with `approved` and feedback content, preserve all attempt traces and observations, pass accumulated feedback and completed-action context to regenerations, sum strategy and critic calls, and measure latency across the entire reflected run.
- [x] T008 [P] [US2] Update `src/agents/react.ts` to consume reflection context on reruns, make prior observations and critique feedback available to generation, and prevent replay of successfully completed state-changing tool calls from earlier attempts.
- [x] T009 [P] [US2] Update `src/agents/plan-and-execute.ts` to seed retry context with prior observations and completed work, include critique feedback in the next generation, and prevent replay of successfully completed state-changing steps.

**Checkpoint**: Both real strategies retain evidence and completed mutations across retries; reflected trace and metrics account for all completed stages.

## Phase 5: User Story 3 - Select reflected strategies in the arena (Priority: P2)

**Goal**: Expose `reflect:react` and `reflect:plan-and-execute` through the arena while preserving its current unreflected defaults.

**Independent Test**: Select each reflected strategy separately and together with deterministic dependencies; verify names, common input, `maxReflection` propagation, separate result traces/metrics, invalid request rejection, and legacy default selection.

### Tests for User Story 3

- [x] T010 [P] [US3] Extend `src/services/arena-service.test.ts` to verify reflected strategies can be selected, receive `maxReflection`, return distinct result entries, and are not added to the default selection when strategy names are omitted.
- [x] T011 [P] [US3] Extend `src/controllers/arena-controller.test.ts` to verify both reflected strategy identifiers, optional `maxReflection` values 0 through 100, rejection of negative, fractional, and greater-than-100 values, and rejection of unknown strategy names before execution.

### Implementation for User Story 3

- [x] T012 [P] [US3] Register decorated ReAct and plan-and-execute strategies in `src/services/arena-service.ts`, pass `maxReflection` to selected strategies, accept the four strategy identifiers, and preserve the existing default of only `react` and `plan-and-execute`.
- [x] T013 [P] [US3] Extend the Zod arena request schema and controller option forwarding in `src/controllers/arena-controller.ts` to accept the four strategy identifiers and optional integer `maxReflection` from 0 through 100.
- [x] T014 [P] [US3] Update `specs/002-reflection-layer/contracts/arena-api.yaml` with both reflected strategy names, `maxReflection` default 2 and bounds 0–100, and the optional boolean `approved` critique field while documenting that omitted strategy selection retains unreflected defaults.
- [x] T015 [P] [US3] Update `src/arena-cli.ts`, `src/arena.ts`, and `src/arena-cli.test.ts` to accept both reflected strategy identifiers, parse and validate `--max-reflection` as an integer from 0 through 100 (including zero), and forward the option to the arena service.

**Checkpoint**: The reflected strategies are selectable through HTTP and existing requests keep the prior default behavior.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Keep validation guidance aligned with implementation and verify repository-level quality.

- [x] T016 [P] Update `specs/002-reflection-layer/quickstart.md` with the final targeted test command and expected reflection, retry-safety, metrics, and arena outcomes.
- [x] T017 Run the quickstart scenarios and full `npm run typecheck` and `npm test` validations documented in `specs/002-reflection-layer/quickstart.md`; resolve failures in the relevant source/test files before marking the task complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No work is required; project scaffolding and dependencies already exist.
- **Foundational (Phase 2)**: T001 establishes shared contracts and blocks story implementation.
- **User Stories**: Start after T001. User Story 2 builds on the core decorator from User Story 1. User Story 3 requires both the decorator and reflected strategy adapters from User Stories 1 and 2.
- **Polish (Phase 6)**: Depends on all selected stories being integrated.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on T001 only; independently delivers the reflection loop using any injected strategy fixture.
- **User Story 2 (P1)**: Depends on User Story 1's decorator contract (T003); adds the externally inspectable trace/metrics and safe integrations with both real strategies.
- **User Story 3 (P2)**: Depends on User Stories 1 and 2; registers complete reflected strategies while keeping existing default behavior.

### Within Each User Story

- Write deterministic tests before their corresponding implementation and confirm they fail for the missing behavior.
- Keep model access injectable in tests; no live provider or database is required for unit/controller/service validation.
- Parallel tasks operate on distinct files after shared prerequisites and tests are in place.

### Parallel Opportunities

- After T001, T002 is the only User Story 1 test task; T003 follows it.
- In User Story 2, T005 and T006 can be written in parallel because they target separate strategy test files. After T004–T006, T007, T008, and T009 can be implemented in parallel across separate agent files.
- In User Story 3, T010 and T011 can be written in parallel. After both tests are in place, T012, T013, T014, and T015 can be implemented in parallel in separate files.
- T015 can run in parallel with implementation work once the expected interface is stable; T016 is the final validation gate.

### Parallel Example: User Story 2

```text
After T004–T006:
Task: T007 update reflection aggregation and chronological trace in src/agents/reflection.ts
Task: T008 update retry context and mutation protection in src/agents/react.ts
Task: T009 update retry context and mutation protection in src/agents/plan-and-execute.ts
```

### Parallel Example: User Story 3

```text
After T010–T011:
Task: T012 register reflected strategies and preserve defaults in src/services/arena-service.ts
Task: T013 validate and forward maxReflection in src/controllers/arena-controller.ts
Task: T014 synchronize the OpenAPI contract in specs/002-reflection-layer/contracts/arena-api.yaml
Task: T015 expose reflected strategies and maxReflection in src/arena-cli.ts and src/arena.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001.
2. Complete T002 and T003.
3. Validate the decorator using deterministic fixtures in `src/agents/reflection.test.ts`.
4. Stop at the User Story 1 checkpoint for a minimal reusable reflection capability; arena exposure and mutation-safe strategy adapters remain later increments.

### Incremental Delivery

1. Shared strategy/context types → reflection decorator and deterministic lifecycle tests.
2. Add critique trace/metric aggregation and retry-safety adapters for ReAct and plan-and-execute.
3. Add explicit reflected-strategy selection to the arena and update its HTTP contract.
4. Update validation guidance, then run `npm run typecheck` and `npm test`.

## Notes

- Every checklist task has a sequential ID, checkbox, required story label where applicable, and an exact file path.
- `[P]` is used only for tasks on separate files with no pending prerequisite between them.
- No persistence schema, migration, dependency installation, or external service setup is required.
