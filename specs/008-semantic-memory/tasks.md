# Tasks: Semantic Memory

**Input**: Design documents from `specs/008-semantic-memory/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, and `quickstart.md`

**Tests**: Included because the specification requires semantic recall testing
and the project constitution requires tests for new logic.

**Organization**: Tasks are grouped by the three P1 user stories. Each story
has its own independent test criteria; shared embedding and SQLite foundations
are completed first.

## Phase 1: Setup

**Purpose**: Add the local embedding dependency used by the feature.

- [X] T001 Add `@huggingface/transformers` as a production dependency in `package.json` and update `package-lock.json`

---

## Phase 2: Foundational

**Purpose**: Provide reusable local embeddings and user-scoped SQLite
persistence before implementing any user story.

- [X] T002 [P] Add embedding pipeline tests for 384 finite normalized Float32 values and concurrent lazy initialization in `src/memory/embeddings.test.ts`
- [X] T003 [P] Add SQLite `:memory:` persistence tests for schema, BLOB round-tripping, user-scoped reads, and scoped deletion in `src/store/sqlite-memory-store.test.ts`
- [X] T004 [P] Implement the lazy `Xenova/all-MiniLM-L6-v2` feature-extraction singleton with `pooling: "mean"`, `normalize: true`, CPU inference, and explicit load/inference errors in `src/memory/embeddings.ts`
- [X] T005 [P] Implement the `memories` table and SQLite row mapping in `src/store/sqlite-memory-store.ts`; enforce `id INTEGER PRIMARY KEY`, `user_id TEXT NOT NULL`, `fact TEXT NOT NULL`, `embedding BLOB NOT NULL`, and `created_at TEXT NOT NULL`, with exactly 384 little-endian Float32 values (1,536 bytes) per embedding
- [X] T006 Add the `user_id` lookup index and persistence methods that require `userId` for all row reads, insert checks, and deletes in `src/store/sqlite-memory-store.ts`

**Checkpoint**: Embeddings and user-scoped persistence are independently
available; story services can use deterministic embedders and SQLite `:memory:`.

---

## Phase 3: User Story 1 - Remember and manage personal facts (Priority: P1)

**Goal**: Save a user's fact unless it is a near-duplicate, and let that user
forget one selected fact without affecting other memories.

**Independent Test**: Remember a fact, confirm a second fact with similarity
strictly greater than `0.92` is not inserted, then forget the original by ID.
Confirm a fact belonging to another user remains unchanged and failures are
reported rather than represented as success.

### Tests for User Story 1

- [X] T007 [P] [US1] Add service tests for new fact persistence, duplicate scores above `0.92`, boundary scores at or below `0.92`, targeted forget, not-found behavior, and explicit failures in `src/services/memory-service.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Implement injected `MemoryService` composition and `remember(userId, fact)` duplicate detection in `src/services/memory-service.ts`; compare only the same user's normalized vectors and preserve the existing fact when similarity is strictly greater than `0.92`
- [X] T009 [US1] Implement `forget(userId, memoryId)` in `src/services/memory-service.ts`; remove only the row matching both identifiers and report a missing/foreign-owned identifier as not found without disclosing ownership

**Checkpoint**: Remember and targeted forget work for one user without changing
another user's facts.

---

## Phase 4: User Story 2 - Recall relevant facts during chat (Priority: P1)

**Goal**: Recall the best matching facts, including cross-vocabulary matches,
and provide them to chat as labeled reference context.

**Independent Test**: Seed a user's fact, submit a semantically equivalent
query with no shared content words, and verify that the fact is included in
strategy input when its score is greater than `0.3`. Verify recall is
score-sorted, excludes scores at or below `0.3`, and returns at most three facts.

### Tests for User Story 2

- [X] T010 [P] [US2] Add deterministic tests for dot-product ranking, strict `score > 0.3` filtering, exclusion at or below `0.3`, and top-three limits in `src/services/memory-recall.test.ts`
- [X] T011 [P] [US2] Add chat-service tests for recalled context alongside history and for unchanged `historyMessages` metrics in `src/services/chat-service.test.ts`
- [X] T012 [P] [US2] Add `/chat` contract tests that reject missing or blank `userId` and do not place `userId` itself in prompt context in `src/controllers/chat-controller.test.ts`
- [X] T013 [P] [US2] Add a model-backed semantic-recall acceptance test using a saved fact and a query with no shared content words in `src/memory/semantic-recall.integration.ts`

### Implementation for User Story 2

- [X] T014 [US2] Implement `recall(userId, query, k = 3)` in `src/services/memory-service.ts`; rank only that user's normalized embeddings by dot product, filter scores strictly greater than `0.3` before sorting and limiting, and return at most `k` in descending score order
- [X] T015 [US2] Extend strategy input and the shared prompt formatter with a clearly labeled untrusted memory-reference section in `src/agents/types.ts`
- [X] T016 [US2] Require a non-empty `userId` in the Zod `/chat` request schema and pass it to chat orchestration in `src/controllers/chat-controller.ts`
- [X] T017 [US2] Recall user-scoped facts before strategy execution and attach them alongside current message and chronological conversation history in `src/services/chat-service.ts`
- [X] T018 [US2] Add the lazy default memory-service singleton backed by the default SQLite database and embedding pipeline in `src/memory/memory-store.ts`
- [X] T019 [US2] Inject the default memory service into the chat controller while retaining test-time dependency injection in `src/controllers/chat-controller.ts`
- [X] T020 [US2] Close the lazy default memory store during HTTP server shutdown in `src/index.ts`

**Checkpoint**: Chat includes only qualifying facts for the supplied user,
without changing the response shape or existing conversation-history metrics.

---

## Phase 5: User Story 3 - Keep memory operations isolated by user (Priority: P1)

**Goal**: Ensure identical or more relevant facts owned by other users cannot
leak into recall or be changed by remember/forget operations.

**Independent Test**: Save equal and semantically similar facts for two users;
run remember, recall, and forget as each user and verify every result and
mutation is limited to the requested user's rows.

### Tests for User Story 3

- [X] T021 [P] [US3] Add cross-user tests covering duplicate detection, recall, foreign memory IDs, and no disclosure of foreign facts in `src/services/memory-isolation.test.ts`

### Implementation for User Story 3

- [X] T022 [US3] Enforce `userId` scoping for every memory lookup, deduplication candidate, recall scan, and delete; ensure foreign-owned IDs have the same not-found behavior as absent IDs in `src/store/sqlite-memory-store.ts` and `src/services/memory-service.ts`
- [X] T023 [US3] Verify the chat request user identity is the sole source of the memory scope and no fallback or unscoped recall is possible in `src/controllers/chat-controller.ts` and `src/services/chat-service.ts`

**Checkpoint**: The isolation journey passes across persistence, memory
operations, and chat context.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature, including its stated performance
target, and document the runnable checks.

- [X] T024 [P] Add an opt-in benchmark for recall p95 with 1,000 memories in `src/memory/memory-recall.bench.ts`
- [X] T025 Update `quickstart.md` with the exact implemented test and benchmark commands in `specs/008-semantic-memory/quickstart.md`
- [X] T026 Run `npm run typecheck` and `npm test`; resolve feature regressions in the affected `src/**/*.ts` files
- [X] T027 Run the model-backed cross-vocabulary acceptance test and the 1,000-memory recall benchmark; record measured outcomes in `specs/008-semantic-memory/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 must finish before embedding
  implementation.
- **Foundational (Phase 2)**: Depends on T001. T002 and T003 can run in
  parallel; T004 and T005 can run in parallel after their corresponding tests.
  T006 follows T005 and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on the foundational phase; T007 precedes
  T008 and T009.
- **User Story 2 (Phase 4)**: Depends on the foundational phase and the
  `MemoryService` introduced by User Story 1. Its tests T010-T013 can be written
  in parallel; the service, prompt, and chat changes follow their tests.
- **User Story 3 (Phase 5)**: Depends on User Stories 1 and 2 because its
  acceptance test covers all three memory operations and chat context.
- **Polish (Phase 6)**: Depends on the desired user stories being complete.
  T024 and T025 can run in parallel; T026 and T027 follow implementation.

### User Story Dependencies

```text
Foundational -> US1 -> US2 -> US3 -> Polish
```

US2 depends on US1's `MemoryService` and shares `src/services/memory-service.ts`;
US3 verifies combined behavior from both stories.

### Parallel Opportunities

- T002 and T003 are separate test files and can be created in parallel.
- T004 and T005 are separate implementation files and can proceed in parallel
  after T001 and their tests.
- T010, T011, T012, and T013 cover distinct files and can be authored in
  parallel after US1.
- T024 and T025 touch separate files and can be prepared in parallel.
- US1 and US2 are intentionally sequential because both extend
  `src/services/memory-service.ts`; US3 follows both to validate isolation
  end-to-end.

## Parallel Example: Foundational Tests

```text
Task: T002 - Add embedding pipeline tests in src/memory/embeddings.test.ts
Task: T003 - Add SQLite memory persistence tests in src/store/sqlite-memory-store.test.ts
```

## Parallel Example: User Story 2 Tests

```text
Task: T010 - Add recall ranking tests in src/services/memory-recall.test.ts
Task: T011 - Add chat orchestration tests in src/services/chat-service.test.ts
Task: T012 - Add request contract tests in src/controllers/chat-controller.test.ts
Task: T013 - Add semantic acceptance test in src/memory/semantic-recall.integration.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete dependency setup and the shared embedding/SQLite foundation.
2. Complete User Story 1 and run its deterministic tests.
3. **Stop and validate** remembering, duplicate suppression, targeted forget,
   and explicit failure behavior independently.

### Incremental Delivery

1. Add User Story 2 and validate ranking, prompt injection, chat request
   validation, and the model-backed cross-vocabulary recall.
2. Add User Story 3 and verify user isolation across all operations.
3. Complete the typecheck, default test suite, and 1,000-memory benchmark.

## Notes

- Every task uses the required checkbox, sequential ID, optional parallel
  marker, required story label for story phases, and an explicit file path.
- The dedicated model-backed acceptance test is separate from the default
  offline test suite because it may download model artifacts on first run.
- No HTTP endpoints for memory CRUD are included; `remember`, `recall`, and
  `forget` remain internal application operations.
