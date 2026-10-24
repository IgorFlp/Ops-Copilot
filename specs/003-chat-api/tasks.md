---
description: "Implementation tasks for the Chat API feature"
---

# Tasks: Chat API

**Input**: Design documents from `/specs/003-chat-api/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/chat-api.yaml`, `quickstart.md`

**Tests**: Included because the specification explicitly requires deterministic
HTTP integration tests with fake strategies and no network access.

**Organization**: Tasks are grouped by user story. Shared strategy lookup is
implemented as a blocking foundation; HTTP behavior is delivered in independent
increments per story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Safe to perform in parallel because the task touches separate files
  and has no incomplete prerequisite.
- **[Story]**: User story label mapped to `spec.md`.
- Every task description names its target file path.

## Phase 1: Setup

**Purpose**: The existing Node.js, TypeScript, Express, Zod, and test runner
setup already satisfies this feature. No project initialization or dependency
installation is needed.

## Phase 2: Foundational

**Purpose**: Establish strategy lookup and a distinct unsupported-strategy
failure before the endpoint stories depend on them.

- [X] T001 [P] Add unit tests for named strategy lookup, default strategy resolution, and unsupported names in `src/agent/index.test.ts`.
- [X] T002 Implement the injectable strategy registry and default `react` and `plan-and-execute` entries in `src/agent/index.ts`; add the `UNSUPPORTED_STRATEGY` domain error code in `src/errors/domain-error.ts`.

**Checkpoint**: The registry can resolve base strategies without invoking a
model or requiring HTTP or database setup.

## Phase 3: User Story 1 - Run a chat request with defaults (Priority: P1) 🎯 MVP

**Goal**: Accept a valid request, select `react` by default or the requested
registered base strategy, and return its reasoning result.

**Independent Test**: Send requests through an in-process Express HTTP server
with an injected deterministic registry. Verify default and explicit strategy
selection and the exact `answer`, `trace`, and `metrics` response fields.

### Tests for User Story 1

- [X] T003 [P] [US1] Add HTTP integration tests for default `react`, explicit `plan-and-execute`, forwarded message, and successful result shape in `src/controllers/chat-controller.test.ts`.

### Implementation for User Story 1

- [X] T004 [US1] Implement strict Zod parsing for `message`, optional `strategy`, and optional `reflect` with defaults `react` and `false`; create an injectable controller factory that receives the registry and returns the selected result as the 200 body in `src/controllers/chat-controller.ts`.
- [X] T005 [US1] Add the `POST /chat` route in `src/routes/chat-routes.ts` and register it in the Express application in `src/app.ts`.

**Checkpoint**: Valid requests work through the registered HTTP route and
return the selected strategy result without a response wrapper.

## Phase 4: User Story 3 - Receive clear errors for invalid requests (Priority: P1)

**Goal**: Distinguish malformed input, unsupported strategies, timeouts, and
strategy failures without returning success-shaped responses.

**Independent Test**: Exercise invalid bodies, unknown strategy names, a fake
strategy that exceeds an injected short deadline, and a fake strategy failure
through HTTP. Verify status codes, structured validation issues, and absence
of a success result on failures.

### Tests for User Story 3

- [X] T006 [P] [US3] Add HTTP integration tests for malformed and extra fields returning 400 with validation issues, unknown strategies returning 422, timeout returning 504, and strategy failures not returning 200 in `src/controllers/chat-errors.test.ts`.

### Implementation for User Story 3

- [X] T007 [US3] Add the `TIMEOUT` domain error code, map `UNSUPPORTED_STRATEGY` to HTTP 422 and `TIMEOUT` to HTTP 504, and preserve Zod issues and sanitized internal errors in `src/errors/domain-error.ts` and `src/middleware/error-handler.ts`.
- [X] T008 [US3] Enforce the 180-second default strategy deadline, allow a shorter injected deadline for deterministic tests, and prevent late completion from sending a second response in `src/controllers/chat-controller.ts`.

**Checkpoint**: Invalid input, unknown strategy, timeout, and execution failure
are distinguishable and never produce an HTTP 200 response.

## Phase 5: User Story 2 - Request a reflected answer (Priority: P2)

**Goal**: Apply the existing reflection wrapper only when the request opts in,
without changing behavior for omitted or false `reflect`.

**Independent Test**: Send HTTP requests using a fake strategy and an injected
reflection decorator/critic. Verify `reflect: true` wraps exactly the selected
strategy and `reflect: false` or omission does not invoke reflection.

### Tests for User Story 2

- [X] T009 [P] [US2] Add deterministic HTTP integration tests for reflected and unreflected requests using a fake reflection dependency and verifying trace and metrics in `src/controllers/chat-reflection.test.ts`.

### Implementation for User Story 2

- [X] T010 [US2] Extend the registry to apply `withReflection` only when requested, support an injected decorator for tests, and pass the `reflect` choice from the controller in `src/agent/index.ts` and `src/controllers/chat-controller.ts`.

**Checkpoint**: Reflection is opt-in and remains isolated to each request's
selected base strategy.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the public contract, offline test guarantee, and project
quality gates.

- [X] T011 Run the focused chat integration tests, `npm run typecheck`, `npm test`, and `git diff --check`; update expected commands or outcomes in `specs/003-chat-api/quickstart.md` if needed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No work is needed; existing tooling is reused.
- **Foundational (Phase 2)**: T001 precedes T002; registry lookup blocks all
  user stories.
- **User Stories**: US1 follows the foundation. US3 and US2 both depend on US1
  because they extend its HTTP endpoint. Complete P1 US3 before P2 US2 where
  working sequentially.
- **Polish (Phase 6)**: Depends on all selected stories.

### User Story Dependencies

- **US1 (P1)**: Depends on the registry foundation only; no other story
  dependency. Delivers the MVP endpoint.
- **US3 (P1)**: Depends on the US1 controller and route; it does not depend on
  reflection.
- **US2 (P2)**: Depends on the US1 controller and registry; it does not depend
  on the error/timeout behavior from US3.

### Within Each User Story

- Write the story's integration test before its implementation and confirm it
  fails for the missing behavior.
- Complete tasks in dependency order when they touch the same files.
- Keep fake strategies, fake decorators, and short test deadlines local to
  tests; no live model or network provider is needed.

### Parallel Opportunities

- T001 can be written alongside T003 because they use separate test files;
  implementations wait for their corresponding tests.
- After US1 is complete, T006 and T009 can be authored in parallel because
  they use separate integration test files.
- US3 error mapping in T007 and US2 registry decoration work in T010 touch
  separate implementation files, but controller changes in T008/T010 must be
  sequential to avoid conflicts.

### Parallel Example: Story Test Preparation

```text
After the US1 endpoint exists:
Task: T006 HTTP error and timeout integration tests in src/controllers/chat-errors.test.ts
Task: T009 reflection integration tests in src/controllers/chat-reflection.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete the registry foundation (T001-T002).
2. Complete US1 (T003-T005).
3. Verify default and explicit strategy selection and the result shape through
   HTTP.
4. Stop at the US1 checkpoint if only a minimal usable chat endpoint is
   required.

### Incremental Delivery

1. Registry foundation → named strategies can be resolved independently.
2. US1 → a valid chat request returns a real reasoning result.
3. US3 → invalid input, unsupported names, timeouts, and execution failures
   have explicit response semantics.
4. US2 → clients may opt into reflection.
5. Polish → run focused and full validation.

## Notes

- [P] is used only for independent work in different files.
- User-story task labels map directly to `spec.md`.
- Every task includes the exact target file path(s).
- The specified 180-second production timeout remains bounded and is shortened
  only through test injection.
