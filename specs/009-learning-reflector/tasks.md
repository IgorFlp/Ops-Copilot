# Tasks: Learning Reflector

**Input**: Design documents from `specs/009-learning-reflector/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/`, and `quickstart.md`

**Tests**: Test tasks are included because the acceptance scenarios require
verification of asynchronous learning, secret exclusion, user isolation, and
safe preference removal.

**Organization**: Tasks are grouped by the three independently verifiable user
stories. User Story 2 and User Story 3 both build on the extractor and memory
replacement foundation from User Story 1.

## Phase 1: Setup

**Purpose**: Confirm project setup and dependencies.

The existing Node.js, TypeScript, LangChain, Zod, SQLite, and test setup already
satisfies this feature. No package or project initialization changes are
required.

---

## Phase 2: Foundational

**Purpose**: Establish prerequisites that block all user stories.

No separate foundational work is required: the project already provides the
user-scoped memory store, OpenRouter model factory, validated chat identity, and
agent tool integrations. Feature-specific prerequisites are implemented with
their owning user story.

---

## Phase 3: User Story 1 - Remember Durable Facts Automatically (Priority: P1)

**Goal**: Learn clear, durable facts from the latest user message after a
successful response, without delaying that response, and safely replace an
unambiguously corrected fact.

**Independent Test**: Complete a chat containing a durable preference and
verify that the response returns before learning finishes and that the fact is
eventually available only in the requesting user's memory. Verify that an
explicit correction replaces exactly one clearly matched memory.

### Tests for User Story 1

- [X] T001 [P] [US1] Test the structured learning schema for `hasLearning` and `fact`, latest-message-only extraction, and empty fact when learning is false in `src/agents/learning-reflector.test.ts`
- [X] T002 [P] [US1] Test user-scoped atomic memory replacement, preserving unrelated rows and rejecting a foreign user's memory ID in `src/store/sqlite-memory-store.test.ts`
- [X] T003 [P] [US1] Test durable-fact learning, explicit-correction matching, exact-one replacement, and ambiguous-correction no-op behavior in `src/services/learning-reflector.test.ts`
- [X] T004 [P] [US1] Test tracked learning-job completion, sanitized failure logging, and draining pending tasks in `src/services/learning-task-runner.test.ts`
- [X] T005 [P] [US1] Test that chat schedules learning only after successful assistant persistence and returns without awaiting the learning task in `src/services/chat-service.test.ts`

### Implementation for User Story 1

- [X] T006 [US1] Implement a strict Zod structured-output extractor with `hasLearning` and `fact`, plus a correction resolver constrained to supplied candidate IDs, in `src/agents/learning-reflector.ts`; provide only the latest user message as evidence for new facts and return at most one candidate
- [X] T007 [US1] Add a scoped atomic replace operation matching both `userId` and `memoryId` to `MemoryStore` and `SqliteMemoryStore` in `src/store/memory-store.ts` and `src/store/sqlite-memory-store.ts`
- [X] T008 [US1] Implement learning orchestration and explicit-correction resolution in `src/services/learning-reflector.ts`; call existing `remember` for new facts and replace only one unambiguously matched owned memory
- [X] T009 [US1] Implement an injectable learning-task runner that tracks asynchronous work, reports sanitized failures, and exposes a drain operation in `src/services/learning-task-runner.ts`
- [X] T010 [US1] Inject and schedule learning after assistant-message persistence without awaiting it in `src/services/chat-service.ts`
- [X] T011 [US1] Wire default learning and task-runner dependencies while preserving test-time injection in `src/controllers/chat-controller.ts`
- [X] T012 [US1] Drain tracked learning jobs before closing the default memory store during graceful shutdown in `src/index.ts`

**Checkpoint**: A successful chat response is not delayed by learning, eligible
facts are persisted for the correct user, and unambiguous explicit corrections
replace only the identified fact.

---

## Phase 4: User Story 2 - Exclude Transient Requests and Secrets (Priority: P1)

**Goal**: Ensure task-specific requests, secrets, and uncertain candidates do
not become durable memories, while allowing a separable non-secret fact to be
learned.

**Independent Test**: Evaluate examples of one-time requests, credentials,
unclear statements, and messages mixing a durable preference with a secret;
verify no ineligible or secret content reaches the memory service.

### Tests for User Story 2

- [X] T013 [P] [US2] Test that transient requests, uncertain extraction results, common credentials, and secret-bearing candidates are not persisted in `src/services/learning-reflector.test.ts`

### Implementation for User Story 2

- [X] T014 [US2] Add conservative extraction instructions and a fail-closed secret guard before persistence in `src/agents/learning-reflector.ts` and `src/services/learning-reflector.ts`; never log source messages or extracted facts

**Checkpoint**: Transient, uncertain, and secret-bearing candidates produce no
memory write; only a separable, durable, non-secret fact can be stored.

---

## Phase 5: User Story 3 - Forget a Learned Preference (Priority: P2)

**Goal**: Let the current user remove one unambiguously matched preference
through `forget_preference`, without accepting model-selected user identity or
changing unrelated memories.

**Independent Test**: Invoke the tool for a user with two preferences and verify
that a unique match removes only the target. Verify that missing or multiple
matches leave memory unchanged and that another user's preference cannot be
read or removed.

### Tests for User Story 3

- [X] T015 [P] [US3] Test preference matching outcomes for one, zero, and multiple user-scoped recall candidates in `src/services/memory-service.test.ts`
- [X] T016 [P] [US3] Test `forget_preference` input validation, user-bound execution, result statuses, and explicit storage failures in `src/agents/tools.test.ts`
- [X] T017 [P] [US3] Test request-scoped preference-tool availability and dispatch in both agent strategies in `src/agents/react.test.ts` and `src/agents/plan-and-execute.test.ts`

### Implementation for User Story 3

- [X] T018 [US3] Implement user-scoped forget-by-description matching in `src/services/memory-service.ts`; delete only when exactly one qualifying memory matches and otherwise return `not_found` or `ambiguous` without mutation
- [X] T019 [US3] Add a validated `forget_preference` tool and scoped dispatch in `src/agents/tools.ts`; capture `userId` from request context and do not include it in model-supplied arguments
- [X] T020 [P] [US3] Pass request-scoped user and memory-tool context to the ReAct agent without adding the user ID to its prompt in `src/agents/react.ts` and `src/agents/types.ts`
- [X] T021 [P] [US3] Add `forget_preference` to plan-and-execute tool selection and dispatch using the same request-scoped identity in `src/agents/plan-and-execute.ts`

**Checkpoint**: The tool removes only one clearly matched preference owned by
the current user; ambiguous, missing, and failed operations are never reported
as successful.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature and keep its design artifacts
consistent.

- [X] T022 [P] Update runnable learning, safety, preference-forgetting, and shutdown scenarios in `specs/009-learning-reflector/quickstart.md` and align both contracts in `specs/009-learning-reflector/contracts/`
- [X] T023 Run targeted learning-reflector, task-runner, memory-store, memory-service, chat, and agent-tool tests described in `specs/009-learning-reflector/quickstart.md`
- [X] T024 Run `npm run typecheck` and `npm test`; resolve feature regressions in `src/**/*.ts`
- [X] T025 [P] Test pre-response clarification for ambiguous corrections and deferred commit for uniquely prepared corrections in `src/services/chat-service.test.ts` and `src/services/learning-reflector.test.ts`
- [X] T026 Add correction preflight and prepared post-response replacement to `src/services/learning-reflector.ts` and `src/services/chat-service.ts`
- [X] T027 Update the correction timing behavior in `specs/009-learning-reflector/spec.md`, `plan.md`, `contracts/learning-reflector.md`, and `quickstart.md`
- [X] T028 Run targeted tests and `npm run typecheck`; full suite passed serially (138/138). The default parallel `npm test` run hit the MCP stdio test's 10-second startup timeout, while that test passed in isolation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No setup task is needed; the existing project stack is
  ready.
- **Foundational (Phase 2)**: No separate blocking task is needed; existing
  user-scoped persistence, model configuration, and agent integration are
  reused.
- **User Story 1 (Phase 3)**: Starts independently. Complete its tests before
  implementation; its memory replacement and extractor support are prerequisites
  for the later stories.
- **User Story 2 (Phase 4)**: Depends on User Story 1's extractor and learning
  orchestration; safety tests and implementation can then proceed.
- **User Story 3 (Phase 5)**: Depends on User Story 1's scoped memory service
  and request integration. It is independent of User Story 2 after User Story
  1 is complete, so Phases 4 and 5 may be developed in parallel if file
  ownership is coordinated.
- **Polish (Phase 6)**: Depends on all selected user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other feature stories; delivers the
  automatic learning MVP.
- **User Story 2 (P1)**: Depends on User Story 1's shared extractor and
  persistence orchestration.
- **User Story 3 (P2)**: Depends on User Story 1's memory-service changes;
  otherwise independent of User Story 2.

### Within Each User Story

- Write and run the story tests before implementing the corresponding behavior.
- Complete user-scoped persistence operations before service orchestration that
  uses them.
- Keep user identity in request-scoped tool context, not model-selected tool
  input or prompt text.
- Complete each checkpoint's independent test criteria before moving to
  cross-cutting validation.

### Parallel Opportunities

- **User Story 1 tests**: T001-T005 target distinct test files and can be
  authored in parallel.
- **User Story 2**: T013 is independent of User Story 3 after User Story 1 is
  complete.
- **User Story 3 tests**: T015-T017 target different files and can be authored
  in parallel.
- **Stories after User Story 1**: User Stories 2 and 3 can proceed in parallel
  when their shared test-file edits are serialized.
- **Polish**: T022 documentation updates can run in parallel with targeted
  tests once implementation is complete; final full-suite validation follows.

## Parallel Examples

### User Story 1

```text
Run T001: structured extractor contract tests in src/agents/learning-reflector.test.ts
Run T002: scoped replacement tests in src/store/sqlite-memory-store.test.ts
Run T003: learning/correction service tests in src/services/learning-reflector.test.ts
Run T004: task-runner lifecycle tests in src/services/learning-task-runner.test.ts
Run T005: non-blocking chat tests in src/services/chat-service.test.ts
```

### User Story 3

```text
Run T015: scoped forget matching tests in src/services/memory-service.test.ts
Run T016: tool contract tests in src/agents/tools.test.ts
Run T017: ReAct and plan-and-execute integration tests in src/agents/react.test.ts and src/agents/plan-and-execute.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete the User Story 1 tests and implementation.
2. Verify response independence, durable-fact persistence, user scoping, and
   explicit-correction behavior.
3. Stop and validate the User Story 1 checkpoint as the first useful
   increment.

### Incremental Delivery

1. Add User Story 2 and verify transient/secret exclusion.
2. Add User Story 3 and verify unique-match forgetting and user isolation.
3. Complete documentation, targeted validation, typecheck, and full tests.

## Notes

- `[P]` marks tasks that touch distinct files and have no dependency on an
  incomplete task.
- `[US1]`, `[US2]`, and `[US3]` map directly to the user stories in
  `specs/009-learning-reflector/spec.md`.
- Every task includes the file path(s) it changes or validates.
