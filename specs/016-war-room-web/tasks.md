---

description: "Task list for War Room Web implementation"
---

# Tasks: War Room Web

**Input**: Design documents from `/specs/016-war-room-web/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included because FR-021 explicitly requires automated tests for the chat flow, typed trace, pending approvals, API URL configuration, base-path routing, and error states.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web client**: `web/src/`, `web/tests/` (colocated tests under `web/src/`)
- **Backend**: `src/` at repository root
- **Feature docs**: `specs/016-war-room-web/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the `web/` package, build tooling, and design foundation.

- [x] T001 Create the `web/` package with `web/package.json` (scripts: `dev`, `build`, `preview`, `test`, `typecheck`; dependencies: `react`, `react-dom`, `react-router-dom`, `zod`; devDependencies: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`)
- [x] T002 [P] Create strict TypeScript configs in `web/tsconfig.json` and `web/tsconfig.node.json`
- [x] T003 [P] Create `web/vite.config.ts` with `base: "/opspilot/"`, the React plugin, and Vitest `jsdom` configuration
- [x] T004 [P] Create `web/index.html` and `web/.env.example` with `VITE_API_BASE_URL`
- [x] T005 [P] Add root convenience scripts (`web:dev`, `web:build`, `web:test`, `web:typecheck`) to `package.json` and ignore `web/node_modules` and `web/dist` in `.gitignore`
- [x] T006 [P] Create design tokens in `web/src/styles/tokens.css`, light/dark values in `web/src/styles/themes.css`, and base styles in `web/src/styles/global.css` using the 4px spacing scale and semantic color tokens
- [x] T007 [P] Create the Testing Library setup in `web/src/test/setup.ts` and deterministic API fixtures in `web/src/test/fixtures/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, configuration, API client, app shell, UI primitives, and backend CORS that every story depends on.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T008 Create shared client types in `web/src/types/chat.ts`, `web/src/types/trace.ts`, and `web/src/types/approval.ts` matching `data-model.md` (including the `TraceEventType` union and `TraceNodeId`)
- [x] T009 [P] Create versioned `localStorage` helpers in `web/src/lib/storage.ts` for `opspilot.apiBaseUrl.v1` and `opspilot.theme.v1`
- [x] T010 [P] Create `web/src/lib/config.ts` with the base path from `import.meta.env.BASE_URL` and the default API URL from `VITE_API_BASE_URL` or the current origin
- [x] T011 [P] Create typed client errors in `web/src/lib/errors.ts` (`VALIDATION`, `UNSUPPORTED_STRATEGY`, `NOT_FOUND`, `TIMEOUT`, `MODEL_UNAVAILABLE`, `INTERNAL`, `NETWORK`)
- [x] T012 Create the API client in `web/src/lib/api-client.ts`: `fetch` wrapper, JSON handling, `X-Request-Id` capture, Zod response validation, and HTTP-to-error mapping for 200, 202, 400, 404, 422, 500, 503, and 504
- [x] T013 Create the React entry and shell in `web/src/main.tsx`, `web/src/App.tsx`, and `web/src/router.tsx` with `basename={import.meta.env.BASE_URL}`, a `/` to `/chat` redirect, and the `/chat` route
- [x] T014 [P] Create UI primitives in `web/src/components/ui/`: `Button.tsx`, `TextField.tsx`, `Spinner.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, and `Dialog.tsx` with accessible labels, visible focus, and 44×44 px targets
- [x] T015 [P] Create the theme provider and hook in `web/src/hooks/useTheme.ts` with `system`/`light`/`dark`, `prefers-color-scheme`, and `data-theme` application
- [x] T016 Create the API configuration provider and hook in `web/src/hooks/useApiConfig.ts` with load, validate, save, and previous-value preservation
- [x] T017 Create the dependency-free CORS middleware in `src/middleware/cors.ts` reading `CORS_ALLOWED_ORIGINS`, handling `OPTIONS` preflight, and setting `Vary: Origin`
- [x] T018 [P] Create CORS tests in `src/middleware/cors.test.ts` covering allowlisted origins, non-allowlisted origins, same-origin requests, and preflight
- [x] T019 Register the CORS middleware in `src/app.ts` before the routers

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Chat with the copilot (Priority: P1) — MVP

**Goal**: An operator sends a message and sees the answer, metrics, and request identifier.

**Independent Test**: Open `/opspilot/chat`, submit a message against a deterministic 200 fixture, and verify the answer, metrics, and request id render.

### Tests for User Story 1

- [x] T020 [P] [US1] Test the chat API client (200 success, 400/422/500/503/504 mapping, network failure) in `web/src/lib/api-client.test.ts`
- [x] T021 [P] [US1] Test the chat lifecycle hook (send, loading, success, failure, retry, conversation continuity) in `web/src/hooks/useChat.test.ts`
- [x] T022 [P] [US1] Test the chat screen (empty state, send, answer, metrics, request id, validation error) in `web/src/pages/ChatPage.test.tsx`

### Implementation for User Story 1

- [x] T023 [P] [US1] Create the chat composer in `web/src/components/chat/ChatComposer.tsx` (Enter sends, Shift+Enter newline, disabled while sending or empty, accessible label)
- [x] T024 [P] [US1] Create the message list in `web/src/components/chat/MessageList.tsx` with distinct user/assistant messages and auto-scroll to the newest message
- [x] T025 [P] [US1] Create the metrics summary in `web/src/components/chat/MetricsSummary.tsx` showing calls, latency, history messages, prompt tokens, and context breakdown when present
- [x] T026 [US1] Implement `useChat` in `web/src/hooks/useChat.ts` with `idle -> sending -> succeeded | failed`, message history, `conversationId` reuse, and retry
- [x] T027 [US1] Implement `ChatPage` in `web/src/pages/ChatPage.tsx` composing the composer, message list, metrics, and loading/empty/error states
- [x] T028 [US1] Wire the chat route in `web/src/router.tsx` and the app shell in `web/src/App.tsx`
- [x] T029 [US1] Add inline validation for empty/whitespace messages linked with `aria-describedby` in `web/src/components/chat/ChatComposer.tsx`

**Checkpoint**: User Story 1 is fully functional and testable independently.

---

## Phase 4: User Story 2 - Inspect the typed reasoning trace (Priority: P1)

**Goal**: "Ver raciocínio" opens a panel that renders the ordered trace by event type.

**Independent Test**: Render a response with several trace event types, open "Ver raciocínio", and verify every event appears in order with its type and structured details.

### Tests for User Story 2

- [x] T030 [P] [US2] Test trace rendering for every known type, structured fields, and unknown-type fallback in `web/src/components/trace/TracePanel.test.tsx`
- [x] T031 [P] [US2] Test the empty-trace state and panel open/close behavior in `web/src/components/trace/TracePanel.test.tsx`

### Implementation for User Story 2

- [x] T032 [P] [US2] Create the trace event item renderer in `web/src/components/trace/TraceEventItem.tsx` with type labels, node, timestamp, tools, arguments, and approval status
- [x] T033 [P] [US2] Create the unknown-type fallback renderer in `web/src/components/trace/TraceEventItem.tsx` that preserves raw content
- [x] T034 [US2] Create the trace panel in `web/src/components/trace/TracePanel.tsx` as an accessible dialog/disclosure with focus handling, `Escape` to close, and scrolling for long traces
- [x] T035 [US2] Add the "Ver raciocínio" button to assistant messages in `web/src/components/chat/MessageList.tsx` when a trace is present
- [x] T036 [US2] Integrate the trace panel into `web/src/pages/ChatPage.tsx` and show the explicit empty-trace state

**Checkpoint**: User Story 2 works independently with fixture responses and integrates with US1.

---

## Phase 5: User Story 3 - Decide a pending approval (Priority: P1)

**Goal**: A 202 response renders an approve/deny card and the decision is submitted and reflected.

**Independent Test**: Return a 202 fixture, verify the card appears with the proposed action, submit approve and deny, and verify the outcome and failure retry.

### Tests for User Story 3

- [x] T037 [P] [US3] Test the approval decision API client (200 approved/denied, 400/404/409/500, network failure) in `web/src/lib/api-client.test.ts`
- [x] T038 [P] [US3] Test the approval card (render, approve, deny, submitting, failure retry, duplicate prevention) in `web/src/components/approval/ApprovalCard.test.tsx`
- [x] T039 [P] [US3] Test 202 handling in `useChat` (pending state, decision submission, result merge) in `web/src/hooks/useChat.test.ts`

### Implementation for User Story 3

- [x] T040 [P] [US3] Add the pending-approval and decision Zod schemas to `web/src/types/approval.ts` per `contracts/http-api.md`
- [x] T041 [US3] Implement 202 detection and pending-approval state in `web/src/hooks/useChat.ts`
- [x] T042 [US3] Implement the approve/deny card in `web/src/components/approval/ApprovalCard.tsx` with action summary, tool, arguments, submitting state, and outcome
- [x] T043 [US3] Implement decision submission and result merge in `web/src/hooks/useChat.ts`, preventing duplicate/stale submissions and keeping the card actionable on failure
- [x] T044 [US3] Integrate the approval card into `web/src/pages/ChatPage.tsx` and `web/src/components/chat/MessageList.tsx`

**Checkpoint**: User Story 3 works independently with 202 fixtures and integrates with US1.

---

## Phase 6: User Story 4 - Configure the API endpoint (Priority: P2)

**Goal**: The settings gear edits, validates, and persists the API base URL.

**Independent Test**: Open settings, save a valid URL, reload, and verify it is restored and used; reject an invalid URL while keeping the previous value.

### Tests for User Story 4

- [x] T045 [P] [US4] Test API URL validation, save, restore, and previous-value preservation in `web/src/hooks/useApiConfig.test.ts`
- [x] T046 [P] [US4] Test the settings panel (open, edit, invalid input, save, close) in `web/src/components/settings/SettingsPanel.test.tsx`

### Implementation for User Story 4

- [x] T047 [P] [US4] Implement URL validation and persistence in `web/src/hooks/useApiConfig.ts` (absolute `http:`/`https:`, trimmed, trailing slash removed)
- [x] T048 [US4] Create the settings panel in `web/src/components/settings/SettingsPanel.tsx` as an accessible dialog with inline validation and confirmation
- [x] T049 [US4] Add the settings gear to the app shell in `web/src/components/layout/AppShell.tsx` and wire it to `useApiConfig`
- [x] T050 [US4] Ensure `web/src/lib/api-client.ts` reads the configured base URL for every request

**Checkpoint**: User Story 4 works independently and affects all API calls.

---

## Phase 7: User Story 5 - Reach the war room under its deployment path (Priority: P2)

**Goal**: The client loads under `/opspilot/`, deep links work, and cross-origin requests succeed.

**Independent Test**: Load `/opspilot/chat` directly, refresh, verify assets and route resolve; verify an allowlisted cross-origin request succeeds.

### Tests for User Story 5

- [x] T051 [P] [US5] Test router basename, `/` redirect, `/chat`, and not-found routing in `web/src/router.test.tsx`
- [x] T052 [P] [US5] Test Express static SPA serving and fallback under `/opspilot/` in `src/app.test.ts`

### Implementation for User Story 5

- [x] T053 [US5] Create the not-found page in `web/src/pages/NotFoundPage.tsx` with a link back to chat
- [x] T054 [US5] Configure the router basename and routes in `web/src/router.tsx` using `import.meta.env.BASE_URL`
- [x] T055 [US5] Serve `web/dist` at `/opspilot` with SPA fallback in `src/app.ts` (production only, without affecting API routes)
- [x] T056 [US5] Verify the Vite base and build output in `web/vite.config.ts` and document the deployment requirement in `web/README.md`

**Checkpoint**: User Story 5 works independently and completes the deployment path.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, dark mode, consistency, and final validation across stories.

- [x] T057 [P] Audit and fix keyboard navigation, focus visibility, labels, and ARIA in `web/src/components/ui/Button.tsx`, `web/src/components/ui/Dialog.tsx`, and `web/src/components/chat/ChatComposer.tsx`
- [x] T058 [P] Audit and fix WCAG AA contrast and dark-mode token values in `web/src/styles/themes.css`
- [x] T059 [P] Audit and fix empty/error/loading state consistency in `web/src/components/ui/EmptyState.tsx`, `web/src/components/ui/ErrorState.tsx`, and `web/src/pages/ChatPage.tsx`
- [x] T060 [P] Add `web/README.md` with setup, scripts, base path, and API URL configuration
- [x] T061 Run `npm --prefix web run typecheck` and `npm --prefix web test` from `web/package.json` and fix failures
- [x] T062 Run `npm run typecheck` and `npm test` from `package.json` for the backend CORS change and fix failures
- [x] T063 Execute the `quickstart.md` validation scenarios and record results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational
  - US1, US2, US3, US4, US5 can proceed in parallel with fixtures
  - US2 and US3 integrate with US1 but are independently testable
- **Polish (Phase 8)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: No dependencies beyond Foundational
- **US2 (P1)**: No hard dependency; integrates with US1's message list
- **US3 (P1)**: No hard dependency; integrates with US1's chat lifecycle
- **US4 (P2)**: No dependencies beyond Foundational; affects all API calls
- **US5 (P2)**: No dependencies beyond Foundational; completes deployment

### Within Each User Story

- Tests first and failing before implementation
- Types/schemas before hooks
- Hooks before page integration
- Core implementation before integration

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- Once Foundational completes, US1–US5 can start in parallel
- Tests within a story marked [P] can run in parallel
- Component tasks within a story marked [P] can run in parallel

---

## Parallel Example: User Story 1

```bash
# Tests
Task: "Test the chat API client in web/src/lib/api-client.test.ts"
Task: "Test the chat lifecycle hook in web/src/hooks/useChat.test.ts"
Task: "Test the chat screen in web/src/pages/ChatPage.test.tsx"

# Components
Task: "Create the chat composer in web/src/components/chat/ChatComposer.tsx"
Task: "Create the message list in web/src/components/chat/MessageList.tsx"
Task: "Create the metrics summary in web/src/components/chat/MetricsSummary.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "Create the trace event item renderer in web/src/components/trace/TraceEventItem.tsx"
Task: "Create the unknown-type fallback renderer in web/src/components/trace/TraceEventItem.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "Test the approval decision API client in web/src/lib/api-client.test.ts"
Task: "Test the approval card in web/src/components/approval/ApprovalCard.test.tsx"
Task: "Test 202 handling in web/src/hooks/useChat.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test US1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test → demo (MVP)
3. US2 → test → demo
4. US3 → test → demo
5. US4 → test → demo
6. US5 → test → demo
7. Polish → final validation

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Then:
   - Developer A: US1
   - Developer B: US2
   - Developer C: US3
   - Developer D: US4 + US5
3. Integrate and run the full test suite

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps tasks to user stories for traceability
- Each user story is independently completable and testable with fixtures
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- The API-side 202 emission and decision endpoint are a dependency recorded in `contracts/http-api.md`; the client is tested against fixtures
