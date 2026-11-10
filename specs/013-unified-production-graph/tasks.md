# Tasks: Unified Production Graph

**Input**: Design documents from `/specs/013-unified-production-graph/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure - no new setup needed as this is an existing project

- [ ] T001 Verify project structure per implementation plan (src/agent/, src/agents/, src/services/, src/controllers/)
- [ ] T002 [P] Verify TypeScript ESM strict mode and Node.js 22+ compatibility in package.json
- [ ] T003 [P] Verify LangGraph, @langchain/openai, Zod dependencies are installed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

### Type System Updates (Required for all user stories)

- [ ] T004 [US1][US2][US3] Add `AttributedTraceEvent` interface extending `TraceEvent` with required `node: TraceNodeId` field in `src/agents/types.ts`
- [ ] T005 [US1][US2][US3] Add `TraceNodeId` type union: `"context" | "route" | "react" | "plan-and-execute" | "reflect:react" | "summary"` in `src/agents/types.ts`
- [ ] T006 [US1][US2][US3] Add `RouteDecision` interface with `route: StrategyId` and `reason: string` in `src/agents/types.ts`
- [ ] T007 [US1][US2][US3] Add `StrategyId` type union: `"react" | "plan-and-execute" | "reflect:react"` in `src/agents/types.ts`
- [ ] T008 [US1][US2][US3] Add `GraphState` interface with `input`, `route?`, `selectedStrategy?`, `selectionSource?`, `strategyResult?`, `trace: AttributedTraceEvent[]`, `metrics` in `src/agents/types.ts`
- [ ] T009 [US1][US2][US3] Add `SelectionSource` type: `"auto" | "override" | "reflect"` in `src/agents/types.ts`

### Strategy Registry Updates (Required for US1, US2)

- [ ] T010 [US1][US2] Update `StrategyRegistry.resolve` to accept three strategy identifiers (`react`, `plan-and-execute`, `reflect:react`) in `src/agent/index.ts`
- [ ] T011 [US1][US2] Export `createProductionGraph` function signature in `src/agent/index.ts`
- [ ] T012 [US1][US2] Export `ProductionGraph` type/class in `src/agent/index.ts`

### Chat Controller Request Validation (Required for US1, US2)

- [ ] T013 [US1][US2] Update `chatRequestSchema` in `src/controllers/chat-controller.ts`: change `strategy` from `.default("react")` to `.optional()` with enum validation for three supported values
- [ ] T014 [US1][US2] Keep `reflect` field with default `false` for backward compatibility in `src/controllers/chat-controller.ts`

**Checkpoint**: Foundation ready - type system, registry, and controller validation updated. User story implementation can now begin.

---

## Phase 3: User Story 1 - Automatic Route Selection (Priority: P1) — MVP

**Goal**: Route a chat request to an appropriate response strategy automatically when no explicit strategy is provided. The router selects exactly one of `react`, `plan-and-execute`, or `reflect:react` and returns a trace with route decision.

**Independent Test**: Submit representative incident and operational questions without specifying a strategy; verify each request produces an answer through one of the supported response strategies and records the routing decision (route event with route and reason).

### Implementation for User Story 1

#### Production Graph Core (src/agent/production-graph.ts)

- [ ] T015 [US1] Create `src/agent/production-graph.ts` with LangGraph `StateGraph<GraphState>` setup
- [ ] T016 [US1] Implement **context node**: builds prompt from `input` using `buildContext`, emits `AttributedTraceEvent` with `node: "context"`, `type: "context"`, content showing assembled prompt sections
- [ ] T017 [US1] Implement **router node**: uses `createModel().withStructuredOutput(RouteDecisionSchema, { includeRaw: true })` with Zod schema for `route` (enum of 3 strategies) and `reason` (minLength 1)
- [ ] T018 [US1] Add router system prompt with route-selection table distinguishing three strategies per FR-004:
  - `react`: "Single-step lookup or simple operational queries using tools directly"
  - `plan-and-execute`: "Multi-step operational tasks requiring explicit planning, sequencing, or incident mutation"
  - `reflect:react`: "Complex analysis requiring self-critique and iterative refinement of the answer"
- [ ] T019 [US1] Add post-parse validation in router node: throw `DomainError("UNSUPPORTED_STRATEGY")` if route not in supported set or reason is empty/whitespace
- [ ] T020 [US1] Implement **conditional edge** from router to strategy nodes based on `route` value
- [ ] T021 [US1] Implement **three strategy nodes** that invoke existing strategies:
  - `react` node → `reactStrategy.run(input)`
  - `plan-and-execute` node → `planAndExecuteStrategy.run(input)`
  - `reflect:react` node → `withReflection(reactStrategy).run(input)`
- [ ] T022 [US1] In each strategy node: map returned `ReasoningResult.trace[]` to `AttributedTraceEvent[]` with `node` set to strategy identifier (`react`, `plan-and-execute`, `reflect:react`)
- [ ] T023 [US1] Aggregate metrics: sum router calls + strategy calls, total latency, combine token usage
- [ ] T024 [US1] Add router trace event: `AttributedTraceEvent` with `node: "route"`, `type: "route"`, `content: JSON.stringify({ route, reason })`
- [ ] T025 [US1] Compile graph with `recursionLimit` sufficient for router + max strategy iterations (e.g., 50)

#### Chat Service Integration (src/services/chat-service.ts)

- [ ] T026 [US1] Modify `ChatService.runChat`: after building `ChatStrategyInput`, invoke production graph instead of direct strategy call
- [ ] T027 [US1] Pass `ChatStrategyInput` as graph `input` state
- [ ] T028 [US1] Merge returned graph trace with pre-graph `summaryEvents`: add `node: "summary"` to each summary event
- [ ] T029 [US1] Preserve existing `ChatServiceResult` shape: `answer`, `trace[]`, `metrics`, `conversationId`
- [ ] T030 [US1] Ensure `metrics` includes `historyMessages`, `promptTokens`, `contextBreakdown` as before
- [ ] T031 [US1] Handle graph errors: catch and re-throw as `DomainError("Chat execution failed", "INTERNAL")` preserving existing behavior

#### Tests for User Story 1

- [ ] T032 [P] [US1] Create `src/agent/production-graph.test.ts` with test suite for production graph
- [ ] T033 [P] [US1] Test: automatic routing selects `react` for simple lookup query (mock router output)
- [ ] T034 [P] [US1] Test: automatic routing selects `plan-and-execute` for multi-step task (mock router output)
- [ ] T035 [P] [US1] Test: automatic routing selects `reflect:react` for complex analysis (mock router output)
- [ ] T036 [P] [US1] Test: router rejects invalid route with `UNSUPPORTED_STRATEGY`
- [ ] T037 [P] [US1] Test: router rejects empty reason with `UNSUPPORTED_STRATEGY`
- [ ] T038 [P] [US1] Test: every trace event has `node` field (`context`, `route`, strategy node)
- [ ] T039 [P] [US1] Test: route event includes `route` and `reason` in content
- [ ] T040 [US1] Test: ChatService integration - automatic routing end-to-end with real strategies (may use mock model)
- [ ] T041 [US1] Test: context prepared once and passed to both router and strategy

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Run `npm test -- src/agent/production-graph.test.ts` and verify all tests pass.

---

## Phase 4: User Story 2 - Explicit Strategy Override (Priority: P1)

**Goal**: Allow API clients to optionally specify a response strategy, overriding automatic selection. The requested strategy is used and represented in the trace as an override, not a router decision.

**Independent Test**: Submit the same valid request with each supported `strategy` value and verify the requested strategy is used and represented in the trace rather than replaced by the router.

### Implementation for User Story 2

#### Production Graph Override Path (src/agent/production-graph.ts)

- [ ] T042 [US2] Modify graph entry: check if `input.strategy` (or separate override field) is provided in GraphState
- [ ] T043 [US2] Add **override path**: if explicit strategy provided, bypass router node entirely
- [ ] T044 [US2] Set `selectionSource: "override"` and `selectedStrategy` from explicit value
- [ ] T045 [US2] Add override trace event: `AttributedTraceEvent` with `node: "route"`, `type: "route"`, `content: JSON.stringify({ route: explicitStrategy, reason: "Explicit override: " + explicitStrategy })`
- [ ] T046 [US2] Conditional edge: override path → directly to corresponding strategy node
- [ ] T047 [US2] Handle legacy `reflect` flag: if no explicit strategy but `reflect: true`, set `selectionSource: "reflect"`, `selectedStrategy: "reflect:react"`, add route event with reason mentioning reflect flag

#### Chat Service Override Integration (src/services/chat-service.ts)

- [ ] T048 [US2] Modify `ChatService.runChat`: pass explicit `strategy` and `reflect` from request to graph via GraphState
- [ ] T049 [US2] Ensure explicit strategy takes precedence over `reflect` flag (FR-012)

#### Chat Controller Updates (src/controllers/chat-controller.ts)

- [ ] T050 [US2] Update `parseChatRequest` / request handling to pass `strategy` and `reflect` to `ChatService.runChat`
- [ ] T051 [US2] Ensure validation rejects unsupported `strategy` values with `UNSUPPORTED_STRATEGY` before graph invocation (already handled by Zod enum + registry)

#### Tests for User Story 2

- [ ] T052 [P] [US2] Test: explicit `strategy: "react"` bypasses router, uses ReAct strategy
- [ ] T053 [P] [US2] Test: explicit `strategy: "plan-and-execute"` bypasses router, uses Plan-and-Execute strategy
- [ ] T054 [P] [US2] Test: explicit `strategy: "reflect:react"` bypasses router, uses Reflected ReAct strategy
- [ ] T055 [P] [US2] Test: no `strategy` provided → router is invoked (automatic routing)
- [ ] T056 [P] [US2] Test: unsupported `strategy` value returns 400 with `UNSUPPORTED_STRATEGY` error
- [ ] T057 [P] [US2] Test: `reflect: true` without strategy selects `reflect:react` (legacy behavior)
- [ ] T058 [P] [US2] Test: explicit `strategy` takes precedence over `reflect: true`
- [ ] T059 [P] [US2] Test: override trace event has `reason` indicating "Explicit override: <strategy>"
- [ ] T060 [US2] Test: ChatController end-to-end with explicit strategy override

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Run chat integration tests.

---

## Phase 5: User Story 3 - Trace Node Attribution (Priority: P2)

**Goal**: Every trace event returned by chat includes a `node` value identifying its originating node (context, route, summary, or strategy), making the unified flow fully observable.

**Independent Test**: Exercise automatic routing and an explicit override, then inspect every returned trace event for a node attribution and a meaningful route event.

### Implementation for User Story 3

#### Trace Event Attribution (Already partially done in US1/US2)

- [ ] T061 [US3] Verify context node emits `node: "context"` on all context preparation events
- [ ] T062 [US3] Verify router node emits `node: "route"` on route decision event (both auto and override)
- [ ] T063 [US3] Verify each strategy node emits `node: "<strategy-id>"` on all its trace events
- [ ] T064 [US3] Verify `ChatService` adds `node: "summary"` to all `summaryEvents` before merging

#### ChatController Response Shape (src/controllers/chat-controller.ts)

- [ ] T065 [US3] Verify response JSON includes `node` on every trace event (no transformation needed if service returns correct shape)

#### Tests for User Story 3

- [ ] T066 [P] [US3] Test: automatic routing trace - every event has `node` field
- [ ] T067 [P] [US3] Test: explicit override trace - every event has `node` field
- [ ] T068 [P] [US3] Test: route event in automatic routing has `node: "route"` and content with route+reason
- [ ] T069 [P] [US3] Test: route event in override has `node: "route"` and content indicating override
- [ ] T070 [P] [US3] Test: summary events have `node: "summary"`
- [ ] T071 [P] [US3] Test: strategy events have correct node (`react`, `plan-and-execute`, `reflect:react`)
- [ ] T072 [P] [US3] Test: existing client compatibility - answer, conversationId, metrics unchanged
- [ ] T073 [US3] Test: full end-to-end trace inspection via manual curl (quickstart.md scenarios)

**Checkpoint**: All user stories should now be independently functional. Run full test suite.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories, validation, and documentation

- [ ] T074 [P] Run `npm run typecheck` - verify zero TypeScript errors
- [ ] T075 [P] Run `npm test` - verify full test suite passes
- [ ] T076 [P] Run quickstart.md validation scenarios manually:
  - Automatic routing curl test
  - Explicit strategy override curl test
  - Legacy reflect flag curl test
  - Invalid strategy error test
- [ ] T077 [P] Update any documentation in `docs/` if applicable
- [ ] T078 Code cleanup: remove any dead code in `ChatService` related to old strategy selection
- [ ] T079 Verify arena/benchmark flows still work (they use `ReasoningStrategy` directly)
- [ ] T080 Performance check: ensure router adds ≤1 model call, total chat under 180s deadline

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - **BLOCKS all user stories**
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (P1) can start after Phase 2
  - US2 (P1) can start after Phase 2 (in parallel with US1 if staffed)
  - US3 (P2) can start after Phase 2 (depends on US1/US2 trace infrastructure)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **US2 (P1)**: Can start after Foundational (Phase 2) - Shares graph infrastructure with US1 but independently testable
- **US3 (P2)**: Can start after Foundational (Phase 2) - Requires trace infrastructure from US1/US2

### Within Each User Story

- Graph core implementation → ChatService integration → Controller integration → Tests
- Tests SHOULD be written first (TDD), fail, then implementation makes them pass

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational type/registry tasks marked [P] can run in parallel (different files)
- Once Foundational phase completes:
  - Developer A: US1 (graph core, service integration, tests)
  - Developer B: US2 (override path, controller, tests)
  - Developer C: US3 (trace verification, tests) - can start after US1/US2 trace infra exists
- All tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all graph tests for User Story 1 together:
Task: "Test: automatic routing selects react for simple lookup query"
Task: "Test: automatic routing selects plan-and-execute for multi-step task"
Task: "Test: automatic routing selects reflect:react for complex analysis"
Task: "Test: router rejects invalid route with UNSUPPORTED_STRATEGY"
Task: "Test: router rejects empty reason with UNSUPPORTED_STRATEGY"
Task: "Test: every trace event has node field"
Task: "Test: route event includes route and reason in content"

# Launch implementation tasks that touch different files:
Task: "Implement context node in src/agent/production-graph.ts"
Task: "Implement router node in src/agent/production-graph.ts"
Task: "Implement strategy nodes in src/agent/production-graph.ts"
Task: "Modify ChatService.runChat in src/services/chat-service.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (automatic routing)
4. **STOP and VALIDATE**: Test User Story 1 independently via `npm test -- src/agent/production-graph.test.ts`
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (graph, service, tests)
   - Developer B: User Story 2 (override, controller, tests)
   - Developer C: User Story 3 (trace verification, tests)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Key files to create/modify:
  - `src/agent/production-graph.ts` (NEW - main graph)
  - `src/agent/production-graph.test.ts` (NEW - graph tests)
  - `src/agents/types.ts` (type additions)
  - `src/agent/index.ts` (registry updates, exports)
  - `src/services/chat-service.ts` (graph invocation, trace merge)
  - `src/controllers/chat-controller.ts` (request validation)