# Tasks: Persisted Trace and JSON Logs

**Input**: Design documents from `/specs/015-persisted-trace-json-logs/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/http-api.md`, `contracts/log-line.md`, `quickstart.md`

**Tests**: Included because FR-015 explicitly requires automated coverage for identifier echoing, persistence, ordered retrieval, metadata-only logs, known/unknown retrieval, and concurrency.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story label (`US1`, `US2`, `US3`, `US4`)
- Every task includes an exact file path

## Path Conventions

- Single project: `src/` at repository root
- Tests live next to the code they cover, matching the existing `*.test.ts` convention
- SQLite database: `./data/opspilot.db` by default, overridable with `OPSPILOT_DB`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the baseline and scaffold the new observation module.

- [X] T001 Run the `typecheck` and `test` scripts in `package.json` from the repository root to record the pre-feature baseline; no code changes.
- [X] T002 [P] Create `src/obs/logger.ts` with the exported `logEvent(event: string, fields?: Record<string, unknown>): void` signature and a minimal JSON-safe stub; full metadata policy lands in US3.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared persistence and orchestration that US2 and US4 depend on.

**CRITICAL**: Complete this phase before starting US2 or US4. US1 and US3 touch different files and can technically proceed in parallel, but the dependency graph below reflects the intended order.

- [X] T003 [P] Define `RequestRecord`, `TraceEventEntry`, `RequestTrace`, and the `RequestStore` interface in `src/store/request-store.ts`, using the field names and nullability from `data-model.md`; include `saveRequest(record, trace)` and `getRequest(requestId)`.
- [X] T004 Write store tests in `src/store/sqlite-request-store.test.ts` covering transactional request+trace insert, retrieval ordered by `position ASC`, unknown identifier returning `null`, duplicate `request_id` failing explicitly, and `ON DELETE CASCADE`; use an in-memory database (`:memory:`).
- [X] T005 Implement `SqliteRequestStore` in `src/store/sqlite-request-store.ts`: create `"request"` and `trace_events` tables plus the `trace_events_request_id_position_idx` index with `CREATE TABLE IF NOT EXISTS`, enforce `status IN ('completed', 'failed')`, `UNIQUE (request_id, position)`, and foreign key `ON DELETE CASCADE`; insert the request and all trace rows in one transaction; retrieve trace ordered by `position ASC`.
- [X] T006 [P] Create `src/store/default-request-store.ts` exposing `getDefaultRequestStore()` and `closeDefaultRequestStore()`, mirroring `src/store/default-ops-store.ts`.
- [X] T007 Implement `RequestTraceService` in `src/services/request-trace-service.ts` with `recordSuccess(input)`, `recordFailure(input)`, and `getRequest(requestId)`; map domain fields to `RequestRecord`, serialize `contextBreakdown` and trace payloads as JSON, and return `null` for unknown identifiers. Export `getDefaultRequestTraceService()` and use it when no store is injected.
- [X] T008 Write service tests in `src/services/request-trace-service.test.ts` for completed and failed mapping, `errorCode` present only on failure, unknown identifier returning `null`, and persistence errors propagating unchanged.
- [X] T009 Wire `closeDefaultRequestStore()` into the shutdown handlers in `src/index.ts` alongside the existing store closures.

**Checkpoint**: The store and request-trace service are ready; US2 and US4 can now build on them.

---

## Phase 3: User Story 1 - Correlate each chat request by an identifier (Priority: P1) - MVP

**Goal**: Every accepted chat request returns a non-empty `requestId` in the body and an identical `X-Request-Id` header, unique per request.

**Independent Test**: Submit one chat request and assert body `requestId` equals the `X-Request-Id` header; submit concurrent requests and assert all identifiers are distinct.

### Tests for User Story 1

- [X] T010 [P] [US1] Write HTTP contract tests in `src/controllers/chat-request-id.test.ts` using the existing local-server pattern from `src/controllers/chat-controller.test.ts`: body `requestId` is a non-empty string, `X-Request-Id` matches it, two sequential requests have distinct identifiers, and responses remain correctly matched under concurrent requests.
- [X] T011 [P] [US1] Update exact-shape assertions in `src/controllers/chat-controller.test.ts` to include the new `requestId` field so the suite reflects the additive response contract.

### Implementation for User Story 1

- [X] T012 [US1] Add optional `requestId?: string` to `ChatServiceInput` in `src/services/chat-service.ts` and include it in the `chat.start`, `chat.completed`, `memory.*`, `context.built`, and `strategy.failure` log calls; update `src/services/chat-service.test.ts` expectations where exact log or input shapes are asserted.
- [X] T013 [US1] Generate `requestId` with `randomUUID()` from `node:crypto` in `src/controllers/chat-controller.ts`, set the `X-Request-Id` response header before execution, pass the identifier into `getChatService().runChat({ ...body, requestId })`, and return it as `requestId` in the success JSON body.

**Checkpoint**: US1 is independently functional: clients can correlate a chat response by body and header. Persistence is not required for this story.

---

## Phase 4: User Story 2 - Persist request metrics and ordered trace events (Priority: P1)

**Goal**: Each settled chat request is persisted once with metrics, outcome, and its trace events in production order; failures are recorded explicitly.

**Independent Test**: Complete a chat request, read the persisted record through the store, and verify one `request` row with metrics plus `trace_events` rows whose positions are contiguous and ordered; repeat with an induced failure and verify `status = failed` with a non-null error code.

### Tests for User Story 2

- [X] T014 [P] [US2] Write persistence integration tests in `src/controllers/chat-persistence.test.ts` using an in-memory `SqliteRequestStore`: successful chat creates one completed record with metrics and ordered trace; failed chat creates one failed record with `errorCode`; 20 concurrent chats keep every record and trace associated with its own `requestId`; persistence failure returns HTTP 500 rather than a success response.
- [X] T015 [P] [US2] Add a test for contiguous zero-based positions and JSON-serializable payloads in `src/services/request-trace-service.test.ts`, including rejection or normalization of invalid positions.

### Implementation for User Story 2

- [X] T016 [US2] Add an optional `requestTraceService` to `ChatControllerOptions` in `src/controllers/chat-controller.ts` and pass it through `ChatRouterOptions` in `src/routes/chat-routes.ts`; default to `getDefaultRequestTraceService()`.
- [X] T017 [US2] In `src/controllers/chat-controller.ts`, capture `startedAt` before execution, then call `recordSuccess` with the result metrics, result trace, conversation id, and selected strategy, or `recordFailure` with the `DomainError` code, duration, and any available trace; perform persistence before sending the response.
- [X] T018 [US2] On persistence failure in `src/controllers/chat-controller.ts`, emit `request.persist_failure` with `requestId` and `errorDetail(error)`, then throw `new DomainError("Request persistence failed", "INTERNAL")` so the existing error handler returns an explicit 500.
- [X] T019 [US2] Enforce trace constraints in `src/services/request-trace-service.ts`: positions must be non-negative contiguous integers starting at 0, `node` and `type` must be non-empty, payloads must be JSON-serializable; throw a `DomainError` with code `VALIDATION` for violations and do not insert partial rows.

**Checkpoint**: US2 is independently testable through the store/controller tests; records and traces are durable and correctly correlated.

---

## Phase 5: User Story 3 - Emit one-line JSON operational logs with metadata only (Priority: P2)

**Goal**: Every operational event is one valid JSON line containing metadata only, with `requestId` when applicable and no conversation content or secrets.

**Independent Test**: Capture stderr while emitting representative events and a chat request; assert every line parses as JSON, one line per event, `requestId` is present on chat events, and no message/answer/prompt/tool-argument/secret content appears.

### Tests for User Story 3

- [X] T020 [P] [US3] Write `src/obs/logger.test.ts` covering: one line per event, `JSON.parse` succeeds for every line, `timestamp` and `event` are present, `undefined` fields are omitted, `Error` values reduce to `{ name, message, code? }`, forbidden content keys are stripped or replaced, and serialization cannot emit a raw newline.
- [X] T021 [P] [US3] Add a metadata-leak test that captures stderr during a chat request in `src/obs/logger.test.ts` and asserts the user message and answer text never appear in any line.

### Implementation for User Story 3

- [X] T022 [US3] Replace the `src/obs/logger.ts` stub with the full implementation: one `JSON.stringify` object per event written to stderr with a trailing newline, ISO-8601 `timestamp`, `event`, omitted `undefined` values, `errorDetail` normalization, safe fallback for unserializable values, and an explicit forbidden-key policy for message/answer/prompt/tool-arg/memory-fact/secret fields.
- [X] T023 [US3] Update `src/lib/log.ts` so `logEvent` delegates to `src/obs/logger.ts` while `errorDetail` remains exported and behavior-compatible; remove the obsolete plain-text formatter.
- [X] T024 [US3] Ensure every chat-related `logEvent` call in `src/services/chat-service.ts` and `src/controllers/chat-controller.ts` includes `requestId` when available, and that no call passes content-bearing fields; adjust call-site metadata only.

**Checkpoint**: US3 is independently testable through the logger tests and produces machine-readable, content-safe logs across existing call sites.

---

## Phase 6: User Story 4 - Retrieve a request record with its ordered trace (Priority: P2)

**Goal**: `GET /requests/:id` returns the persisted record and its trace in original order, with explicit 404 for unknown or unsettled identifiers.

**Independent Test**: Persist a request with several trace events, retrieve it by identifier, and verify the record and ordered trace are returned; retrieve an unknown identifier and verify 404.

### Tests for User Story 4

- [X] T025 [P] [US4] Write HTTP tests in `src/controllers/request-controller.test.ts` using the local-server pattern: `200` returns `{ request, trace }` ordered by position, a failed record retains `status = "failed"` and its trace, unknown identifiers return `404`, and an empty `:id` returns `400`.
- [X] T026 [P] [US4] Add a retrieval test for a request with many trace events in `src/controllers/request-controller.test.ts` asserting the full untruncated list is returned in order.

### Implementation for User Story 4

- [X] T027 [US4] Implement `src/controllers/request-controller.ts` with a Zod schema requiring a non-empty `id`, a call to `RequestTraceService.getRequest(id)`, `200` with `{ request, trace }` when found, and `next(new DomainError("Request not found", "NOT_FOUND"))` when not found.
- [X] T028 [US4] Create `src/routes/request-routes.ts` with `router.get("/requests/:id", createRequestController(options))`, export `requestRouter`, and register it in `src/app.ts` before `errorHandler`.
- [X] T029 [US4] Ensure `RequestTraceService.getRequest` in `src/services/request-trace-service.ts` sorts by `position ASC` and returns parsed payload objects, not JSON strings, matching `contracts/http-api.md`.

**Checkpoint**: US4 is independently functional for any persisted record, including failed requests.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across stories.

- [X] T030 [P] Add or confirm a 20-concurrent end-to-end correlation test in `src/controllers/chat-persistence.test.ts` that also retrieves each record and asserts trace ownership.
- [X] T031 [P] Add a retrieval latency sanity assertion (under 1 second) for `GET /requests/:id` in `src/controllers/request-controller.test.ts`.
- [X] T032 Run the `typecheck` script in `package.json` and fix any type errors across the new and modified files.
- [X] T033 Run the `test` script in `package.json` and fix any failures; confirm all feature tests pass alongside the existing suite.
- [X] T034 Execute the validation steps in `specs/015-persisted-trace-json-logs/quickstart.md` against a running server and confirm `requestId` echo, persistence, retrieval, JSON log lines, and metadata-only content.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. Blocks US2 and US4; US1 and US3 have no file dependency on it but should follow the recommended order.
- **US1 (Phase 3)**: Depends on Setup only.
- **US2 (Phase 4)**: Depends on Foundational and US1 (needs the `requestId` already threaded into the controller/service).
- **US3 (Phase 5)**: Depends on Setup; log calls touched by US1/US2 should be present to verify `requestId` inclusion.
- **US4 (Phase 6)**: Depends on Foundational.
- **Polish (Phase 7)**: Depends on all desired stories.

### User Story Dependencies

- **US1 (P1)**: Independent after Setup.
- **US2 (P1)**: Requires the identifier from US1 and the store/service from Foundational.
- **US3 (P2)**: Independent after Setup; verification benefits from US1/US2 call sites.
- **US4 (P2)**: Requires the store/service from Foundational; independent of US1/US2/US3 at the HTTP level.

### Within Each User Story

- Tests are written before implementation and are expected to fail.
- Types before store implementation.
- Store before service.
- Service before controller/route.
- Controller before route registration.
- Validate the story at its checkpoint before moving on.

### Parallel Opportunities

- T002 (logger scaffold) can run alongside T001.
- T003 (types) can start as soon as Setup completes.
- T010 and T011 (US1 tests) can be written together.
- T014 and T015 (US2 tests) can run in parallel.
- T020 and T021 (US3 tests) can run in parallel.
- T025 and T026 (US4 tests) can run in parallel.
- T030 and T031 (polish tests) can run in parallel.
- Different stories can be assigned to different developers after their prerequisites; US1 and US3 can proceed concurrently, while US2 and US4 wait for Foundational.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files):
Task: "Write requestId HTTP contract tests in src/controllers/chat-request-id.test.ts"
Task: "Update exact-shape assertions in src/controllers/chat-controller.test.ts"

# Then implementation:
Task: "Add optional requestId to ChatServiceInput and chat logs in src/services/chat-service.ts"
Task: "Generate requestId, set X-Request-Id, and return requestId in src/controllers/chat-controller.ts"
```

## Parallel Example: User Story 2

```bash
# Tests can be written together:
Task: "Write persistence and concurrency tests in src/controllers/chat-persistence.test.ts"
Task: "Write position/payload constraint tests in src/services/request-trace-service.test.ts"

# Implementation order:
Task: "Inject RequestTraceService into controller and router"
Task: "Record success/failure before responding and handle persistence failure"
Task: "Enforce contiguous positions and JSON-serializable payloads"
```

## Parallel Example: User Story 3

```bash
Task: "Write JSON line and normalization tests in src/obs/logger.test.ts"
Task: "Write metadata-leak capture test in src/obs/logger.test.ts"
```

## Parallel Example: User Story 4

```bash
Task: "Write retrieval HTTP tests in src/controllers/request-controller.test.ts"
Task: "Write large-trace retrieval test in src/controllers/request-controller.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup).
2. Complete Phase 2 (Foundational) because the plan wires the store for later stories.
3. Complete Phase 3 (US1).
4. **STOP and VALIDATE**: run T010/T011, confirm body/header `requestId` correlation and concurrency uniqueness, and run `npm run typecheck` plus `npm test`.
5. Deploy/demo the correlation MVP if desired.

### Incremental Delivery

1. Setup + Foundational completes the persistence primitives.
2. US1 delivers request correlation and is shippable on its own.
3. US2 delivers durable request/trace records.
4. US3 delivers machine-readable, metadata-only logs.
5. US4 delivers retrieval by identifier.
6. Polish validates the complete observability loop.

### Parallel Team Strategy

1. Team completes Setup + Foundational together.
2. Developer A: US1 (request identifier), then US2 (persistence orchestration).
3. Developer B: US3 (JSON logger), then US4 (retrieval) after Foundational.
4. Integrate at the checkpoints; US2 and US4 share the same store/service but modify different controllers/routes.

---

## Notes

- `[P]` tasks use different files and can run in parallel when prerequisites are complete.
- Story labels provide traceability from requirement to task.
- Tests are required by FR-015 and must be written before implementation.
- Trace payloads may contain content and are persisted; log lines may not contain content.
- Commit after each task or logical group only when explicitly requested by the user.
