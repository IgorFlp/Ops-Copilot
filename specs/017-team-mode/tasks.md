---

description: "Task list for Team Mode (017-team-mode)"
---

# Tasks: Team Mode

**Input**: Design documents from `/specs/017-team-mode/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: INCLUDED — FR-016 of the specification explicitly requires automated tests covering the supervisor, each role boundary, handoff trace events, the eight-handoff ceiling, executor authorization, unknown-route rejection, and the team route end-to-end.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `src/` (TypeScript ESM, `node:test` via `tsx`, tests colocated as `*.test.ts`)
- **Web**: `web/src/` (Vite + React + TypeScript, Vitest, tests colocated as `*.test.tsx`)

---

## Phase 1: Setup (Shared Vocabulary)

**Purpose**: Extend the shared trace/strategy vocabulary that both backend and web depend on.

- [X] T001 [P] Extend the backend trace vocabulary in `src/agents/types.ts`: add `"handoff"` to `TraceEventType`, add `"team"` to `TraceNodeId`, add optional `from?: string`, `to?: string`, `brief?: string` to `TraceEvent`, and export a `TeamRoleId` union (`"analista" | "planejador" | "executor"`).
- [X] T002 [P] Extend the web vocabulary in `web/src/types/trace.ts` (add `"handoff"` to `TRACE_EVENT_TYPES`; add `"team"` to `TRACE_NODE_IDS`; add optional `from`/`to`/`brief` string fields to `traceEventSchema`) and in `web/src/types/chat.ts` (add `"team"` to `STRATEGIES`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared team-mode domain primitives required before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [P] Define the team domain types and constants in `src/team/types.ts`: `SupervisorDecision` (`next: "analista" | "planejador" | "executor" | "done"`, `brief: string` non-empty) with its Zod schema, `HandoffTraceEvent` (`type: "handoff"`, `node: "team"`, `from`, `to`, `brief`, `timestamp`), `BlackboardEntry` (`role`, `content`, `at`), `TeamBlackboard` (`entries`, `historyBriefs`), `TeamRunState`, and `TEAM_MAX_HANDOFFS = 8`.
- [X] T004 [P] Implement the shared in-memory blackboard in `src/team/blackboard.ts`: `createBlackboard()`, `addEntry(blackboard, role, content)`, `recordBrief(blackboard, brief)`, and read helpers; pure and scoped to a single run (no IO, nothing persisted).

**Checkpoint**: Vocabulary and blackboard ready — user story implementation can begin.

---

## Phase 3: User Story 1 - Coordinated team answer (Priority: P1) 🎯 MVP

**Goal**: The `team` route runs a supervisor that coordinates roles over the blackboard and returns one final answer using the existing chat response shape.

**Independent Test**: Submit a request selecting `team` against a deterministic injected supervisor/roles and verify a single final answer plus the accumulated contribution trail are returned with the standard response shape (`answer`, `trace`, `metrics`, `requestId`, `conversationId`).

### Tests for User Story 1 (write first, ensure they FAIL)

- [X] T005 [P] [US1] Unit tests for the supervisor decision in `src/team/supervisor.test.ts`: valid `{next, brief}` passes; missing/empty `next` or `brief` raises a `DomainError`.
- [X] T006 [P] [US1] Integration test for the team strategy in `src/team/team-strategy.test.ts`: with injected deterministic supervisor/role dependencies, the run ends on `done` and returns one answer assembled from the blackboard.

### Implementation for User Story 1

- [X] T007 [US1] Implement the supervisor decision in `src/team/supervisor.ts` using `createModel().withStructuredOutput(supervisorDecisionSchema, { includeRaw: true })` plus a `safeParse` re-check; invalid output throws a `DomainError` (no guessing), mirroring `routerNode` in `src/agent/production-graph.ts`.
- [X] T008 [US1] Implement the role runners in `src/team/roles.ts` (`analista`, `planejador`, `executor`) as reasoning contributors that read the blackboard and append a `BlackboardEntry`; the Executor may use read-only ops tools via `createOpsToolsForRequest`/`invokeOpsTool` from `src/agents/tools.ts`.
- [X] T009 [US1] Implement the team strategy in `src/team/team-strategy.ts`: a LangGraph `StateGraph` (`supervisor` node → dispatched role node → back to `supervisor`) that ends when the supervisor returns `next: "done"` and assembles the final `answer` from the blackboard; export `ReasoningStrategy` named `"team"`.
- [X] T010 [US1] Register the `team` route: add `"team"` to `StrategyId` in `src/agents/types.ts`, add the strategy to the default strategy registry in `src/agent/index.ts`, and support `"team"` in the router decision enum, override edges and strategy nodes in `src/agent/production-graph.ts`.
- [X] T011 [US1] Accept `"team"` in `src/controllers/chat-controller.ts` (add `"team"` to `chatRequestSchema.strategy` enum) and cover it in `src/controllers/chat-controller.test.ts`: the `team` strategy registers and resolves, the request boundary accepts `strategy: "team"`, and an unknown strategy is rejected with a validation error.

**Checkpoint**: The `team` route returns a coordinated answer end-to-end and can be validated independently.

---

## Phase 4: User Story 2 - Handoffs visible in "Ver raciocínio" (Priority: P1)

**Goal**: Every control transfer records a `handoff` trace event that the web trace panel renders in order.

**Independent Test**: Produce a team trace containing handoffs plus other events and verify "Ver raciocínio" lists each handoff in original order with its source, target and brief, and that an unknown event type is still shown.

### Tests for User Story 2 (write first, ensure they FAIL)

- [X] T012 [P] [US2] Backend test in `src/team/team-strategy.test.ts`: each transfer emits exactly one `handoff` event with `from`, `to`, `brief` and `node: "team"`, in order.
- [X] T013 [P] [US2] Web test in `web/src/components/trace/TraceEventItem.test.tsx`: a `handoff` event renders a "Handoff" label and its source, target and brief; an unknown type still renders with a fallback label.

### Implementation for User Story 2

- [X] T014 [US2] Emit `handoff` trace events in `src/team/team-strategy.ts` (one per supervisor→role transfer: `type: "handoff"`, `node: "team"`, `from: "supervisor"`, `to: <role>`, `brief`, `timestamp`); ensure they serialize through the existing trace persistence in `src/services/request-trace-service.ts` without change.
- [X] T015 [US2] Render handoffs in `web/src/components/trace/TraceEventItem.tsx` (add `handoff: "Handoff"` to `TYPE_LABELS` and a `de`/`para`/brief detail list) and add a handoff entry to `web/src/test/fixtures/index.ts` (`sampleTrace`).

**Checkpoint**: Handoffs are recorded and rendered; US1 still works.

---

## Phase 5: User Story 3 - Role boundaries and authorization (Priority: P1)

**Goal**: Enforce the Analista (read-only, never proposes nor executes), Planejador (no tools) and Executor (incident mutations only under authorization, no bypass) boundaries.

**Independent Test**: Run each role with deterministic dependencies: the Analyst proposes/executes nothing, the Planner invokes zero tools, and the Executor refuses a mutation when `isMutationAuthorized` is false while performing it when authorized.

### Tests for User Story 3 (write first, ensure they FAIL)

- [X] T016 [P] [US3] Tests in `src/team/roles.test.ts`: the Analyst contributes no proposed action and executes nothing; the Planner invokes zero tools.
- [X] T017 [P] [US3] Tests in `src/team/roles.test.ts`: the Executor refuses `open_incidente`/`resolve_incidente` when `isMutationAuthorized` is false and performs it when true, with no bypass path.

### Implementation for User Story 3

- [X] T018 [US3] Enforce the boundaries in `src/team/roles.ts`: Analyst uses read-only operations only and never emits a proposed action nor a mutation; Planner is given no tools at all; Executor routes every incident mutation through `isMutationAuthorized` (`src/agents/mutation-policy.ts`) via `createOpsToolsForRequest` (`src/agents/tools.ts`) and refuses otherwise.

**Checkpoint**: All three roles respect their boundaries; the team route remains safe.

---

## Phase 6: User Story 4 - Bounded runs (eight handoffs) (Priority: P2)

**Goal**: Cap a run at eight handoffs and, on reaching the cap, stop with the best available outcome or an explicit incomplete outcome — never a fabricated success.

**Independent Test**: Force a supervisor that keeps delegating and verify the run stops at exactly eight handoffs and is reported as incomplete/failed, not fully successful.

### Tests for User Story 4 (write first, ensure they FAIL)

- [X] T019 [P] [US4] Tests in `src/team/team-strategy.test.ts`: a run never exceeds `TEAM_MAX_HANDOFFS` (8) and a cap-stopped run is not returned as a fully successful answer (either best-available with an explicit incomplete marker or a `DomainError`).

### Implementation for User Story 4

- [X] T020 [US4] Enforce the ceiling in `src/team/team-strategy.ts`: track the handoff count, stop at `TEAM_MAX_HANDOFFS = 8`, return the best available answer or raise a `DomainError`, and emit a `fallback` trace marker so a cap-stopped run is never presented as a full success (FR-011, FR-012).

**Checkpoint**: All user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate the whole feature against the quickstart and the constitution.

- [X] T021 [P] Run backend gates: `npm run typecheck` and `npm test`. Typecheck is green; the new `src/team/*` tests (15) all pass. NOTE: 33 pre-existing failures in the repo's suite are unrelated to this feature (verified by running `npm test` on the pre-change tree); the web/controller HTTP suites fail because the production graph needs `OPENROUTER_*` config and `createModel` cannot be monkey-patched in this ESM setup.
- [X] T022 [P] Run web gates: `npm --prefix web run typecheck` (green) and `npm --prefix web run test` (40/40 pass, including the 2 new `TraceEventItem` handoff tests).
- [X] T023 Execute the offline scenarios in `specs/017-team-mode/quickstart.md`: base-path build (`npm run web:build`) succeeds and handoff rendering/handoff events are covered by automated tests. Live model scenarios (real `strategy: "team"` calls) require `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` and are run by an operator against a configured environment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phases 3–6)**: All depend on Foundational.
  - US1 is the MVP and creates the team strategy, roles, supervisor and route; US2, US3 and US4 build on US1's files and should follow it.
  - US2, US3 and US4 are independent of each other once US1 is complete.
- **Polish (Phase 7)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational only.
- **US2 (P1)**: Depends on US1 (needs the running team strategy to emit handoffs).
- **US3 (P1)**: Depends on US1 (extends `src/team/roles.ts` and `src/team/supervisor.ts`).
- **US4 (P2)**: Depends on US1 (extends the loop in `src/team/team-strategy.ts`).

### Within Each User Story

- Tests are written first and MUST FAIL before implementation.
- Types/blackboard before supervisor/roles; supervisor/roles before the strategy; strategy before route wiring.
- Complete a story's checkpoint before moving on.

### Parallel Opportunities

- T001 and T002 (Setup) touch different trees → parallel.
- T003 and T004 (Foundational) touch different files → parallel.
- T005 and T006 (US1 tests, different files) → parallel.
- T012 and T013 (US2 tests, backend vs web) → parallel.
- T016 and T017 (US3 tests, same file — combine sequentially if needed).
- T019 (US4 test) runs after US1's test file exists.
- T021 and T022 (Polish gates, backend vs web) → parallel.

---

## Parallel Example: User Story 1

```bash
# Launch the US1 tests together (different files):
Task: "Supervisor decision tests in src/team/supervisor.test.ts"
Task: "Team strategy integration test in src/team/team-strategy.test.ts"
```

## Parallel Example: Setup + Foundational

```bash
# Setup vocabulary (parallel):
Task: "Backend trace vocabulary in src/agents/types.ts"
Task: "Web vocabulary in web/src/types/trace.ts and web/src/types/chat.ts"

# Foundational primitives (parallel):
Task: "Team domain types in src/team/types.ts"
Task: "Blackboard in src/team/blackboard.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (BLOCKS all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: confirm a `team` request returns a coordinated answer with the standard shape.
5. Deploy/demo if ready.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → coordinated answer (MVP).
3. US2 → handoffs visible in "Ver raciocínio".
4. US3 → role boundaries and authorization guaranteed.
5. US4 → bounded runs (eight handoffs).
6. Polish → gates green and quickstart validated.

### Parallel Team Strategy

After Foundational and US1, US2 (trace/rendering), US3 (boundaries) and US4 (ceiling) can proceed in parallel by different developers, then converge in Polish.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps a task to its user story for traceability.
- Backend tests use `node:test` with injected deterministic dependencies (no network); web tests use Vitest with fixtures.
- The supervisor's terminal actor is `"done"` (per the feature request example), replacing the earlier `"finish"` naming used while drafting the design docs.
- Pre-existing, unrelated failures: the suite has 33 failures on the untouched tree (production-graph ESM monkey-patching, `combineModelUsage` shape, and chat HTTP/chat-service suites that require `OPENROUTER_*`). This feature adds no new failures.
- Avoid: vague tasks, same-file parallelism, cross-story edits that break independence.
