# Tasks: OpsPilot Reasoning Arena

**Input**: Design documents from `/specs/001-reasoning-arena/`

**Prerequisites**: plan.md, spec.md. Optional research.md and data-model.md were not available when these tasks were generated.

**Tests**: Include deterministic offline tests because spec requirements FR-013 and the project constitution explicitly require tests for the operational store and trace formatting, and all new logic must have `node:test` coverage.

**Organization**: Tasks are grouped by the four user stories in `spec.md`. Every task uses the required checkbox, sequential ID, optional parallel marker, story label where applicable, and exact project path.

## Phase 1: Setup

**Purpose**: Align project scripts with the HTTP arena design and provide a repeatable seed command.

- [x] T001 Update `package.json` scripts to remove the CLI arena entry point and register `npm run seed` for `tsx scripts/seed.ts`.

---

## Phase 2: Foundational

**Purpose**: Establish shared database, model, error, trace, and HTTP foundations required before feature stories.

- [x] T002 Implement the Sequelize PostgreSQL connection in `src/models/database.ts`, reading connection settings from runtime environment, exporting an explicit authenticate/sync lifecycle, and surfacing connection failures.
- [x] T003 Define typed domain errors and their safe classification in `src/errors/domain-error.ts` so predictable operation failures can be translated at the HTTP boundary without exposing internal details.
- [x] T004 Define Sequelize `Service`, `Alert`, and `Incident` models and associations in `src/models/service.ts`, `src/models/alert.ts`, and `src/models/incident.ts`; alerts have `firing` or `resolved` status, and incidents have `open` or `resolved` status and `critical`, `high`, `medium`, or `low` severity.
- [x] T005 Define the shared `ReasoningStrategy`, `ReasoningResult`, trace-event union, action payload (`tools` and `args`), and metrics (`calls` and `latencyMs`) in `src/agents/types.ts`; use externally observable summaries, not private chain-of-thought.
- [x] T006 Create Express application assembly and HTTP startup in `src/app.ts` and `src/index.ts`, mount feature routers without introducing a CLI, and centralize safe domain-error-to-HTTP response mapping in `src/middleware/error-handler.ts`.

**Checkpoint**: Shared project boundaries, persistence models, and result types are available to all stories.

---

## Phase 3: User Story 1 - Inspect and manage operational records (Priority: P1) - MVP

**Goal**: Provide validated alert listing and persistent incident creation and resolution against the PostgreSQL source of truth.

**Independent Test**: With deterministic model/repository fixtures and no provider network, list alerts by each status, create and resolve an incident for a known service, and verify invalid input, unknown references, and repeat resolution fail explicitly without reporting success.

### Tests for User Story 1

- [x] T007 [P] [US1] Add deterministic service/store tests for alert status filtering, incident creation, successful resolution, unknown service/incident, already-resolved incident, and invalid severity in `src/services/incident-service.test.ts`.
- [x] T008 [P] [US1] Add tool-schema and tool-result tests for `list_alerts(status)`, `open_incidente(title, service, severity)`, and `resolve_incidente(id)` including malformed arguments in `src/agents/tools.test.ts`.

### Implementation for User Story 1

- [x] T009 [US1] Implement incident and alert domain operations with persistence, service existence checks, explicit not-found/conflict errors, and transactional state changes in `src/services/incident-service.ts`.
- [x] T010 [US1] Implement Zod-validated LangChain tools for listing alerts, opening incidents, and resolving incidents, delegating all persistence and domain rules to the incident service in `src/agents/tools.ts`.

**Checkpoint**: Operational tools can be exercised deterministically without a live model provider and persist valid actions through Sequelize.

---

## Phase 4: User Story 2 - Investigate an operational question (Priority: P1)

**Goal**: Return a grounded answer, externally observable typed trace, accurate LLM-call count, and elapsed latency from bounded reasoning strategies.

**Independent Test**: Run strategies with deterministic model/tool fixtures and no provider network; verify ordered event types and payloads, final answer, every LLM call counted, and that iteration and eight-step ceilings are respected.

### Tests for User Story 2

- [x] T011 [P] [US2] Add deterministic trace serialization/formatting tests for all six event types, stable ordering, action tool names and arguments, and safe thought summaries in `src/lib/trace-format.test.ts`.
- [x] T012 [P] [US2] Add ReAct strategy tests using a fake model/agent stream and fake tools to verify captured actions, observations, answer, call counts, latency, tool failure, and iteration stopping in `src/agents/react.test.ts`.
- [x] T013 [P] [US2] Add plan-and-execute graph tests using deterministic planner/executor/replanner fixtures to verify structured plans, one-step execution, replanning, completion, eight-step maximum, iteration limit, and call counts in `src/agents/plan-and-execute.test.ts`.

### Implementation for User Story 2

- [x] T014 [P] [US2] Implement the single OpenRouter chat-model factory in `src/agents/model.ts`, reading `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, configuring the OpenRouter base URL and temperature `0`, and explicitly rejecting missing configuration.
- [x] T015 [P] [US2] Implement deterministic rendering of typed trace events in `src/lib/trace-format.ts`, preserving event order and action tool arguments while rendering only user-facing thought summaries.
- [x] T016 [US2] Implement the ReAct strategy using LangGraph's prebuilt ReAct agent and the three operational tools in `src/agents/react.ts`; capture externally observable model/tool events, count model calls, enforce the iteration limit, and return the common result type.
- [x] T017 [US2] Implement the plan-and-execute graph in `src/agents/plan-and-execute.ts` with structured ordered string steps, one OpenRouter-backed tool selection and invocation per executor step, replanner decisions to adjust/continue/finish, an eight-step ceiling, the configured iteration limit, and accurate call/latency metrics.

**Checkpoint**: Both strategies return the common result contract and traces without exposing private chain-of-thought or converting failures into successful answers.

---

## Phase 5: User Story 3 - Compare bounded reasoning strategies (Priority: P2)

**Goal**: Let an operator submit one validated HTTP request to compare one or both strategies on identical input and receive separate results.

**Independent Test**: Exercise the endpoint with a deterministic strategy registry; verify omitted strategy selection runs both strategies on identical input, explicit selection runs only selected strategies, every result includes answer/trace/metrics, and invalid input returns a client error without running strategies.

### Tests for User Story 3

- [x] T018 [P] [US3] Add arena request validation and controller tests for missing input, empty strategy selection, unknown strategies, non-positive or excessive iteration limits, and safe error responses in `src/controllers/arena-controller.test.ts`.
- [x] T019 [P] [US3] Add arena service tests proving each selected strategy receives identical input and configured limits and returns its own result and failure state in `src/services/arena-service.test.ts`.

### Implementation for User Story 3

- [x] T020 [US3] Document the arena request and response schema, strategy names, defaults, validation failures, and trace/metrics shapes in `specs/001-reasoning-arena/contracts/arena-api.yaml`.
- [x] T021 [US3] Implement the arena service to select registered strategies, apply the shared input and iteration limit, run them independently, and collect separate results in `src/services/arena-service.ts`.
- [x] T022 [US3] Implement the Zod-validated HTTP controller in `src/controllers/arena-controller.ts`; default omitted strategies to both implementations, default the iteration limit to eight, and map invalid requests and operational failures to explicit HTTP errors.
- [x] T023 [US3] Register the arena HTTP route in `src/routes/arena-routes.ts` and mount it through `src/app.ts`; return each strategy's answer, ordered trace, call count, and latency in the response.

**Checkpoint**: Operators can compare strategies over HTTP with validated input and isolated results; the developer CLI is added separately in Phase 8.

---

## Phase 6: User Story 4 - Reproduce sample data and verify output offline (Priority: P3)

**Goal**: Supply a repeatable development seed with five services and six varied alerts, and verify reruns do not create duplicates or remove unrelated records.

**Independent Test**: Run the seed twice against the configured development PostgreSQL database; verify exactly five designated services and six designated alerts (three firing, three resolved), with no duplicates and no deletion of unrelated rows. Run store and trace-format tests with network access disabled.

### Tests for User Story 4

- [x] T024 [P] [US4] Add deterministic seed idempotency tests using fixture-scoped fake repositories, verifying stable fixture keys, five designated services, six designated alerts, and preservation of unrelated records in `scripts/seed.test.ts`.

### Implementation for User Story 4

- [x] T025 [US4] Implement the repeatable PostgreSQL seed entry point in `scripts/seed.ts`, creating or updating five named services and six varied alerts with exactly three `firing` and three `resolved` statuses, and never deleting unrelated records.
- [x] T026 [US4] Configure a development-only `predev` seed invocation in `package.json` after `T025` exists; ensure production startup does not run the seed and the seed never force-drops or truncates operational records.

**Checkpoint**: Re-running the development seed leaves the fixture set stable and preserves unrelated database content.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify project-wide quality gates and document end-to-end validation.

- [x] T027 [P] Write the runnable setup, seed, HTTP arena request examples, and expected responses in `specs/001-reasoning-arena/quickstart.md`, including deterministic offline test commands and PostgreSQL prerequisites.
- [x] T028 Run `npm run typecheck` and `npm test` from the repository root; fix any feature-related failures in the affected `src/`, `scripts/`, or `package.json` files and confirm both commands pass.
- [ ] T029 Run the documented seed-twice and HTTP arena scenarios from `specs/001-reasoning-arena/quickstart.md`; record expected fixture counts and verify answers, trace types, calls, and latency are present.

---

## Phase 8: Developer CLI

**Purpose**: Provide the explicitly requested local command-line entry point alongside the HTTP endpoint.

- [x] T030 Add `npm run arena -- "input" --strategies react` with validated strategy and iteration flags, database lifecycle handling, JSON answers/traces/metrics output, deterministic CLI tests, and updated project scope documentation in `src/arena.ts`, `src/arena-cli.ts`, `src/arena-cli.test.ts`, `package.json`, `specs/001-reasoning-arena/`, and `.specify/memory/constitution.md`.
- [x] T031 Support short/canonical service references and unique single-character typos, seed Catalog API while retaining five service fixtures, strengthen planner/executor prompts for ordered explicit actions, reject empty plans for explicit operational commands, and add deterministic coverage in `src/services/incident-service.ts`, `src/services/incident-service.test.ts`, `scripts/seed.ts`, `scripts/seed.test.ts`, `src/agents/plan-and-execute.ts`, and `src/agents/plan-and-execute.test.ts`.
- [x] T032 Add stage-specific model/tool failure context and include prior completed step observations when an execution fails in `src/agents/plan-and-execute.ts`, with deterministic partial-completion diagnostics coverage in `src/agents/plan-and-execute.test.ts`.
- [x] T033 Pass completed observations to each plan executor call, normalize `incident_id`/`incidentId` to the required numeric `id` for resolve tools, and verify the sequential open-then-resolve flow in `src/agents/plan-and-execute.ts`, `src/agents/tools.ts`, `src/agents/plan-and-execute.test.ts`, and `src/agents/tools.test.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on the database connection, models, and domain errors from Phase 2.
- **User Story 2 (Phase 4)**: Depends on shared result types from Phase 2 and operational tools from US1.
- **User Story 3 (Phase 5)**: Depends on the strategies from US2 and the Express foundation from Phase 2.
- **User Story 4 (Phase 6)**: Depends on the persistent models and database connection from Phase 2; seed fixtures must match the operational tool models from US1.
- **Polish (Phase 7)**: Depends on all desired stories being implemented.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2; standalone MVP for persistent alert and incident operations.
- **US2 (P1)**: Can start after Phase 2, but tool integration and independently useful operational investigations require US1 tools; complete US1 before strategy integration.
- **US3 (P2)**: Requires both strategies from US2 and the HTTP application foundation.
- **US4 (P3)**: Requires Phase 2 models; shares the persisted record contract with US1. Seed implementation can proceed independently of strategy work once models are ready.

### Within Each User Story

- Complete the deterministic tests before the implementation tasks they validate.
- Complete models and domain services before tool adapters.
- Complete shared result/model/trace prerequisites before either reasoning strategy.
- Complete the arena service before wiring its controller and route.
- Complete seed fixture tests before implementing the seed entry point.

### Parallel Opportunities

- Phase 2: `T003` domain errors and `T005` shared type declarations can be developed in parallel after paths are agreed; `T004` models can proceed independently of trace types.
- US1: `T007` service tests and `T008` tool-schema tests target different files and can be authored in parallel.
- US2: `T011`, `T012`, and `T013` are separate test files; `T014` model factory and `T015` formatter are independent. After shared types/tools are complete, `T016` and `T017` can be implemented in separate strategy files.
- US3: `T018` controller validation tests and `T019` arena service tests are independent. Contract definition `T020` can proceed in parallel with those tests.
- US4: `T024` seed tests can be authored independently of reasoning-strategy work; once models exist, seed development can run in parallel with US2.
- Polish: `T027` quickstart authoring can proceed while feature work is underway, then `T028` and `T029` run after implementation is integrated.

## Parallel Example: User Story 2

```text
Task: T011 Trace-formatting tests in src/lib/trace-format.test.ts
Task: T012 ReAct strategy tests in src/agents/react.test.ts
Task: T013 Plan-and-execute graph tests in src/agents/plan-and-execute.test.ts
Task: T014 OpenRouter model factory in src/agents/model.ts
Task: T015 Trace formatter in src/lib/trace-format.ts
```

The strategy implementation tasks T016 and T017 can run in parallel after their shared types, tools, and deterministic test fixtures are available.

## Implementation Strategy

### MVP First (User Story 1 Only)

Complete Phases 1-3 to provide persistent alert listing and incident create/resolve operations with explicit validation and deterministic service/tool tests. Verify the database-backed behavior before proceeding.

### Incremental Delivery

1. Deliver US1 operational tools as the first usable increment.
2. Add US2 reasoning results and both bounded strategies.
3. Add US3 HTTP comparison endpoint after strategies are independently callable.
4. Add US4 repeatable sample seed and final end-to-end validation.

### Parallel Team Strategy

After the foundational phase, assign US1 data operations, US2 strategy implementation, and US4 seed work to separate contributors only where their shared model/tool interfaces are agreed; US2 integration depends on US1 tools, and US3 depends on completed strategies. Keep same-file tasks sequential.

## Notes

- Task format validation: every task line uses `- [ ] Tnnn`, includes `[P]` only for independent work, includes `[USn]` on all user-story tasks, and names at least one exact file path.
- The requirements checklist was generated by `/speckit-specify`; it is distinct from this implementation task list.
