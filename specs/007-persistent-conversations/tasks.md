# Tasks: Persistent Conversations

**Input**: Design documents from `/specs/007-persistent-conversations/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/chat-api.yaml`, `quickstart.md`

**Tests**: Required by FR-010 and the project constitution. Use `node:test`
via `tsx`, `:memory:` SQLite, fake conversation stores, and deterministic fake
strategies; do not make provider or network calls. `HISTORY_MESSAGES_THRESHOLD`
defaults to 12 and must be a positive safe integer when configured.

**Organization**: Tasks are grouped by the three prioritized user stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another task in the phase because it edits
  different files and has no dependency on incomplete work.
- **[Story]**: User story addressed by the task (`US1`, `US2`, or `US3`).
- Every task names the file or files to change.

## Phase 1: Setup

**Purpose**: Project initialization.

No setup tasks are required: Node.js 22, native `node:sqlite`, TypeScript,
Express, and `node:test` via `tsx` are already configured in `package.json` and
`src/models/database.ts`.

---

## Phase 2: Foundational

**Purpose**: Define the shared persistence boundary required by all stories.

- [X] T001 Define `ConversationRecord`, `ConversationMessage`, message-role types, `ChatInput` (`message` plus ordered `history`), and the `ConversationStore` contract for `create`, `append`, and bounded `lastMessages` retrieval in `src/store/conversation-store.ts` and `src/agents/types.ts`; specify message roles `user` or `assistant`, non-null content, conversation-scoped retrieval, newest-first store order, and structured input compatibility with existing string strategy callers.

**Checkpoint**: The store contract is available; story work can begin.

---

## Phase 3: User Story 1 - Start or continue a conversation (Priority: P1)

**Goal**: Start a durable conversation or continue the exact conversation named
by the request; return its identifier and reject unknown identifiers.

**Independent Test**: Exercise `POST /chat` with no identifier and then with
the returned identifier using a fake store and deterministic strategy. Verify
the identifier is created or preserved, messages persist in order, and an
unknown identifier returns 404 without creating a replacement.

### Tests for User Story 1

- [X] T002 [P] [US1] Test `SqliteConversationStore` create and append, role/content persistence, conversation isolation, and not-found behavior when appending to an unknown conversation using `:memory:` in `src/store/sqlite-conversation-store.test.ts`.
- [X] T003 [P] [US1] Test `ChatService` new and existing conversation flows, message persistence order, unknown-ID failure, and strategy-failure behavior with a fake `ConversationStore` and deterministic strategy in `src/services/chat-service.test.ts`.
- [X] T004 [P] [US1] Test `POST /chat` accepting optional `conversationId`, returning new or reused identifiers, rejecting empty/non-string identifiers, and mapping unknown conversations to 404 in `src/controllers/chat-controller.test.ts`.

### Implementation for User Story 1

- [X] T005 [US1] Implement `SqliteConversationStore.create` and `append` in `src/store/sqlite-conversation-store.ts` using `openDatabase` from `src/models/database.ts`; create idempotent `conversations` and `messages` tables, with a text primary-key conversation ID and message fields `id INTEGER PRIMARY KEY`, `conversation_id` foreign key, `role` constrained to `user` or `assistant`, non-null `content`, and non-null `created_at`; use bound parameters, translate appends to unknown conversations into not-found domain errors, and close the database explicitly.
- [X] T006 [US1] Implement the initial conversation-aware orchestration in `src/services/chat-service.ts`: create a conversation when no ID is supplied; for a supplied ID, call `lastMessages` so unknown conversations fail as not found before strategy execution; append the user message before running the strategy and append the assistant message only after a successful result; propagate persistence and domain failures without returning a successful result.
- [X] T007 [US1] Extend request validation and successful response mapping in `src/controllers/chat-controller.ts` to accept optional non-empty string `conversationId`, call the injected chat service, and return its conversation identifier without changing existing answer, trace, or metric fields.
- [X] T008 [US1] Wire the production `SqliteConversationStore` and chat-service dependencies through `src/routes/chat-routes.ts` and `src/index.ts`, sharing `OPSPILOT_DB` and closing the conversation store during the existing shutdown lifecycle.
- [X] T009 [US1] Update existing deterministic HTTP fixtures and expected response bodies for the new injected conversation dependency in `src/controllers/chat-errors.test.ts`, `src/controllers/chat-reflection.test.ts`, and `src/controllers/chat-controller.test.ts`, preserving their validation, timeout, reflection, and execution-failure assertions.

**Checkpoint**: New and resumed conversations work through `/chat`, persist
successful exchanges, and report unknown IDs as errors.

---

## Phase 4: User Story 2 - Continue with relevant conversation history (Priority: P1)

**Goal**: Compose the newest prior messages from the selected conversation
into each structured strategy input, bounded by `HISTORY_MESSAGES_THRESHOLD`
(default 12) and ordered chronologically.

**Independent Test**: Seed a fake conversation store with zero, fewer than the
threshold, and more prior messages than the threshold. Verify the strategy
receives the current request and only the available or newest history messages
in chronological order; verify no other conversation's messages are included.

### Tests for User Story 2

- [X] T010 [P] [US2] Add fake-store service tests for empty, partial, exactly-threshold, and over-threshold histories in `src/services/chat-service.test.ts`; assert the strategy receives `{ message, history }`, history is chronological and conversation-scoped, and the new request appears only in `message`.
- [X] T011 [P] [US2] Add SQLite boundary tests for `lastMessages(conversationId, limit)` returning the newest limited messages, newest-first, from only the requested conversation in `src/store/sqlite-conversation-store.test.ts`.
- [X] T012 [P] [US2] Test `HISTORY_MESSAGES_THRESHOLD` defaulting to 12, accepting positive safe integers, and rejecting zero, negative, fractional, unsafe, or non-numeric values in `src/services/chat-service.test.ts`.

### Implementation for User Story 2

- [X] T013 [US2] Implement validated threshold parsing and the default value of 12 in `src/services/chat-service.ts`; report an explicit configuration error for any configured value that is not a positive safe integer.
- [X] T014 [US2] Implement bounded `lastMessages(conversationId, limit)` retrieval in `src/store/sqlite-conversation-store.ts` with a conversation-scoped, parameterized query ordered by message ID descending; reject unknown conversations and return no more than the requested limit.
- [X] T015 [US2] Update `ChatService` in `src/services/chat-service.ts` to fetch up to `HISTORY_MESSAGES_THRESHOLD` messages before appending the current user request, reverse selected messages into oldest-to-newest order, and invoke `strategy.run({ message, history })`.
- [X] T016 [US2] Update `ReasoningStrategy` and existing ReAct, plan-and-execute, and reflection strategy adapters in `src/agents/types.ts`, `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and `src/agents/reflection.ts` to accept structured chat input and normalize it into role-labeled context, while preserving string inputs for arena and benchmark callers.

**Checkpoint**: Follow-up requests use only the correct conversation's recent
history, and 0, partial, and over-limit cases are independently verified.

---

## Phase 5: User Story 3 - Verify how much history was used (Priority: P2)

**Goal**: Report the exact number of prior messages included in the prompt as
`metrics.historyMessages`.

**Independent Test**: Through the chat service and HTTP route, verify
`historyMessages` is 0 for no prior history, equals the partial history count,
and equals 12 for histories longer than the cap.

### Tests for User Story 3

- [X] T017 [P] [US3] Test that `metrics.historyMessages` equals `history.length` for empty, partial, and over-threshold histories in `src/services/chat-service.test.ts`.
- [X] T018 [P] [US3] Test the successful `POST /chat` response includes `metrics.historyMessages` and `conversationId` while preserving existing metrics and result fields in `src/controllers/chat-controller.test.ts`.

### Implementation for User Story 3

- [X] T019 [US3] Extend the chat-service result type and successful response assembly in `src/services/chat-service.ts` so `metrics.historyMessages` equals `history.length` and is a non-negative integer no greater than the configured threshold.
- [X] T020 [P] [US3] Update the `ChatResult` and `Metrics` schemas in `specs/007-persistent-conversations/contracts/chat-api.yaml` to require top-level `conversationId` and a non-negative `metrics.historyMessages` bounded by `HISTORY_MESSAGES_THRESHOLD` (default 12).

**Checkpoint**: Every successful chat response exposes an accurate, bounded
history count.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Keep implementation validation and feature documentation
consistent with the delivered behavior.

- [X] T021 [P] Update `specs/007-persistent-conversations/quickstart.md` with the final focused test paths and expected results for persistence, history composition, configurable threshold, metrics, and error cases.
- [X] T022 Run `npm run typecheck` and `npm test` from `package.json`; resolve any regressions in the touched `src/store/`, `src/services/`, `src/controllers/`, `src/routes/`, `src/agents/`, and `src/index.ts` files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks; dependencies and runtime are already present.
- **Foundational (Phase 2)**: T001 defines the interface required by store,
  service, and test-double work.
- **User Story 1 (Phase 3)**: Depends on T001; delivers the MVP conversation
  lifecycle.
- **User Story 2 (Phase 4)**: Depends on US1's persistent store and service
  flow; adds bounded history retrieval and composition.
- **User Story 3 (Phase 5)**: Depends on US2 because the metric must count the
  messages actually composed into strategy input.
- **Polish (Phase 6)**: Depends on the stories selected for delivery.

### User Story Dependencies

- **US1 (P1)**: Starts after T001; creates/resumes and persists conversations.
- **US2 (P1)**: Starts after US1; uses its store and chat-service lifecycle to
  add recent history to strategy input.
- **US3 (P2)**: Starts after US2; reports the actual composed-history count.

### Parallel Opportunities

- T002, T003, and T004 are independent test files after T001 and can be
  prepared in parallel.
- T010 and T011 are independent service/store test files after US1.
- T014 and T015 are independent service/controller test files after US2.
- T017's OpenAPI schema update and T018's quickstart update edit separate
  documentation files and can run in parallel with implementation review.
- Store, service, and controller work has cross-story dependencies and should
  not be parallelized until the shared interfaces and response shape are agreed.

## Parallel Example: User Story 1

```text
After T001, prepare these tests in parallel:
Task: T002 - SQLite persistence tests in src/store/sqlite-conversation-store.test.ts
Task: T003 - Chat service fake-store tests in src/services/chat-service.test.ts
Task: T004 - HTTP contract tests in src/controllers/chat-controller.test.ts

Then implement and wire the store, service, controller, and runtime in
dependency order (T005 -> T006 -> T007 -> T008).
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001, then complete US1 tasks T002-T009.
2. Verify new conversation creation, continuation, persistence, unknown-ID
   errors, and current chat behavior using fake strategies and `:memory:`.
3. Stop and validate the MVP independently before adding prompt history.

### Incremental Delivery

1. Complete US1 for a persistent conversation lifecycle.
2. Complete US2 to add configurable, bounded, ordered history to structured strategy input.
3. Complete US3 to expose the actual history count in response metrics.
4. Run the quickstart scenarios, typecheck, and full test suite.
