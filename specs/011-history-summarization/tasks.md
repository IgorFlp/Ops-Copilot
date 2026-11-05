---
description: "Implementation tasks for history summarization"
---

# Tasks: History Summarization

**Input**: Design documents from `specs/011-history-summarization/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Required by the feature specification and project constitution. Use a stand-in summarizer and an in-memory SQLite database; do not call OpenRouter or read `.env`.

**Organization**: Tasks are grouped by user story and ordered by the story priorities in `spec.md`.

## Phase 1: Setup

**Purpose**: Project initialization and shared tooling.

The Node.js, TypeScript, SQLite, and `node:test` setup already exists. No new dependencies or project initialization are required for this feature.

---

## Phase 2: Foundational

**Purpose**: Add the shared persistence contract and implementation required by the user stories.

- [X] T001 Define the summary record and add `getSummary`, `saveSummary`, and `uncoveredDepartedMessages` signatures to `src/store/conversation-store.ts`
- [X] T002 Implement the `conversation_summaries` table and the three summary operations in `src/store/sqlite-conversation-store.ts`; enforce one row per conversation, cascade deletion, and same-conversation coverage validation

**Checkpoint**: Summary persistence is available to the chat service and can be tested using the in-memory database.

---

## Phase 3: User Story 1 - Keep a long conversation usable (Priority: P1) 🎯 MVP

**Goal**: Keep only the newest eight prior messages verbatim, persist an initial summary of the oldest eight departed messages, and include that summary separately in strategy context.

**Independent Test**: With a fake summarizer and an in-memory conversation store, exercise a conversation with at least eight departed messages. Verify only the newest eight prior messages are verbatim in context, the initial summary is persisted and included in a separate labeled section, and a summary from another conversation is never used.

### Tests for User Story 1

- [X] T003 [P] [US1] Test absent summaries, save-and-replace behavior, coverage validation, and conversation isolation in `src/store/sqlite-conversation-store.test.ts`
- [X] T004 [P] [US1] Test initial summarization, the eight-message verbatim limit, and summary inclusion using a fake summarizer in `src/services/chat-service.test.ts`
- [X] T005 [P] [US1] Test chronological selection of the newest eight prior messages, selection of the oldest eight departed messages, and safe prompt framing in `src/context/history-summary.test.ts`

### Implementation for User Story 1

- [X] T006 [US1] Implement fixed-window selection, oldest-departed-batch selection, and the untrusted-data summary prompt builder in `src/context/history-summary.ts`
- [X] T007 [US1] Create the injected `ConversationSummarizer` adapter in `src/agents/conversation-summarizer.ts`; use `createModel()` with temperature 0 and `maxTokens: 256`, and return prompt-token usage only when it is a non-negative number
- [X] T008 [P] [US1] Add optional `conversationSummary` to `ChatStrategyInput` and render it as a separate labeled, untrusted-data section in `formatStrategyInput` in `src/agents/types.ts`
- [X] T009 [US1] Update `ChatService` in `src/services/chat-service.ts` to use a fixed eight-message history window, create and persist the initial summary from the oldest eight departed messages, validate trimmed summary text with `estimateTokens` (1–200 inclusive), pass the saved summary separately to the strategy, and fail before appending the current user message if summarization fails

**Checkpoint**: A long conversation retains its key older context without copying older raw messages into the strategy prompt.

---

## Phase 4: User Story 2 - Refresh the summary only after eight messages leave (Priority: P1)

**Goal**: Reuse the saved summary until eight new uncovered messages have left the recent window, then merge and persist oldest-first batches without resummarizing covered messages.

**Independent Test**: Seed a saved summary and add seven uncovered departed messages; verify no summarizer call or write occurs. Add the eighth and verify the prior summary plus exactly those eight messages are passed to the fake, and the saved cursor advances. Verify catch-up processes each overdue group in order and a rejected update leaves the prior saved row unchanged.

### Tests for User Story 2

- [X] T010 [US2] Test summary reuse below the eight-message boundary, merging at the boundary, oldest-first catch-up across multiple batches, and failed-update preservation with a fake summarizer in `src/services/chat-service.test.ts`

### Implementation for User Story 2

- [X] T011 [US2] Extend the summary-update loop in `src/services/chat-service.ts` to skip incomplete uncovered groups, merge each oldest group of exactly eight into the previous summary, save each accepted batch before continuing, and stop with a domain error on provider, validation, or storage failure without replacing the rejected batch

**Checkpoint**: A saved summary is unchanged until a full new group of eight messages is uncovered; catch-up remains deterministic and does not resubmit covered messages.

---

## Phase 5: User Story 3 - See when a summary was refreshed (Priority: P2)

**Goal**: Make each successfully saved summary update observable in the turn trace and account for summary context and model usage in metrics.

**Independent Test**: Compare a turn that saves one or more summaries with a reuse-only turn. Verify each accepted save has one ordered `summarize` event with the saved text, reuse has no such event, and summary prompt-token usage follows the existing completeness rule.

### Tests for User Story 3

- [X] T012 [US3] Test ordered `summarize` events for saved batches, no event on reuse or rejected updates, summary context token estimates, and combined prompt-token reporting in `src/services/chat-service.test.ts`

### Implementation for User Story 3

- [X] T013 [US3] Add `summarize` to `TraceEventType` in `src/agents/types.ts` and update `src/services/chat-service.ts` to prepend one event per accepted save in batch order, expose `contextBreakdown.summary` only when included, and sum prompt tokens only when every strategy and summary call reports a valid count

**Checkpoint**: The trace distinguishes refreshes from reuse, and metrics represent the separate summary context without inflating `historyMessages`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Keep the feature guide and verification commands aligned with the implementation.

- [X] T014 Update the scenarios and focused test command in `specs/011-history-summarization/quickstart.md` to match the implemented tests and confirm that no live model provider is used
- [X] T015 Run the focused tests listed in `specs/011-history-summarization/quickstart.md`, then run `npm run typecheck` and `npm test` for changes under `src/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Existing project setup is reused; no setup tasks are needed.
- **Foundational (Phase 2)**: T001 precedes T002; both must be complete before user-story work.
- **User Story 1 (Phase 3)**: Depends on the foundational persistence contract and implementation.
- **User Story 2 (Phase 4)**: Depends on US1's persistence and initial summary flow; it adds subsequent refreshes and catch-up.
- **User Story 3 (Phase 5)**: Depends on US2's successful update flow so events and usage can be checked against actual saved batches.
- **Polish (Phase 6)**: Depends on the desired user stories being implemented.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; delivers initial summarization and summary-aware context.
- **US2 (P1)**: Follows US1 because refreshes merge into its persisted summary and extend its `ChatService` flow.
- **US3 (P2)**: Follows US2 because events and summary model usage correspond to accepted batch updates.

### Parallel Opportunities

- T003, T004, and T005 use separate test files and can be prepared in parallel after Phase 2.
- In US1, the three tests (T003–T005) can run in parallel. After they are ready, T006 and T008 touch separate files and can proceed independently; T007 depends on the prompt helper in T006, and T009 depends on the helper, adapter, and strategy input.
- US2 test T010 must precede the service change T011 because both change the same test/service behavior.
- US3 test T012 must precede T013; the stories otherwise proceed in order because they extend `ChatService`.
- No user-story phases are independent of one another in this design.

## Parallel Example: User Story 1

```text
After Phase 2, prepare these separate-file tests in parallel:
T003: Store persistence and isolation tests in src/store/sqlite-conversation-store.test.ts
T004: Initial summary and context tests in src/services/chat-service.test.ts
T005: History window and prompt tests in src/context/history-summary.test.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 2 persistence prerequisites.
2. Complete US1 to persist and include an initial summary with the fixed eight-message window.
3. Validate US1 independently with the fake summarizer and in-memory database.

### Incremental Delivery

1. Deliver US1 as the first working increment.
2. Add US2's reuse boundary, merging, catch-up, and explicit failure behavior.
3. Add US3's trace events and model-usage/context metrics.
4. Update the quickstart and run focused tests, typecheck, and the complete test suite.
