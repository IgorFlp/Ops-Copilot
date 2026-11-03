# Tasks: Provider Status Checks

**Input**: Design context from `spec.md`, repository tool patterns in
`src/agents/tools.ts` and `src/agents/tools.test.ts`, and scripts in
`package.json`. The current `plan.md` is still the unfilled Spec Kit template;
no `research.md`, `data-model.md`, `contracts/`, or `quickstart.md` is available.

**Tests**: Required by FR-009 and the feature description. Use fake fetch
functions; tests must not make external network calls.

## Phase 1: Setup

**Purpose**: No setup tasks are needed. The project already has TypeScript,
Zod, LangChain tools, and `node:test` configured.

## Phase 2: Foundational

**Purpose**: No shared data store, schema migration, or routing foundation is
required. The tool is an observation-only addition to the existing agent tools.

## Phase 3: User Story 1 - Check an external provider's status (Priority: P1) 🎯 MVP

**Goal**: Let the operator check GitHub or Cloudflare, default to GitHub, and
receive a compact status indicator and description.

**Independent Test**: With fake fetch responses, verify that each provider maps
to its specified public status endpoint, omitting `provider` selects GitHub,
and successful results contain the indicator and description on one line.

### Tests for User Story 1

- [X] T001 [US1] Add fake-fetch success tests for GitHub, Cloudflare, the GitHub default, and one-line status output in `src/agents/provider-status.test.ts`

### Implementation for User Story 1

- [X] T002 [US1] Create a fetch-injectable status checker with the GitHub and Cloudflare endpoint mapping, status-response Zod validation, compact success output, and readable failure result in `src/agents/provider-status.ts`
- [X] T003 [US1] Register `check_provider_status` with a documented `provider` enum/default and incident-triage usage description; include it in tool creation, exports, and `invokeOpsTool` dispatch in `src/agents/tools.ts`, and cover tool behavior in `src/agents/tools.test.ts`

**Checkpoint**: US1 can be demonstrated independently using fake provider
responses, and the tool's omitted provider selects GitHub.

## Phase 4: User Story 2 - Get a clear result when a provider status cannot be checked (Priority: P1)

**Goal**: Bound each request to five seconds, retry exactly once only for a
timeout, network failure, or 5xx response, validate returned data, and return a
readable tool result for every final failure.

**Independent Test**: With fake fetch functions, verify timeout/network/5xx
retry counts, no retry for malformed data or non-5xx HTTP responses, and a
readable final error string rather than an exception.

### Tests for User Story 2

- [X] T004 [US2] Add fake-fetch tests for per-attempt timeout, a single retry after timeout/network failure/5xx, no retry for invalid status data or non-5xx responses, and readable final failures in `src/agents/provider-status.test.ts`

### Implementation for User Story 2

- [X] T005 [US2] Apply a five-second timeout to each fetch attempt and enforce exactly one retry for timeout, network failure, or 5xx while returning concise error strings for final failures in `src/agents/provider-status.ts`
- [X] T006 [US2] Verify that `check_provider_status` exposes success and failure observations as tool results without throwing and that invalid provider arguments are rejected by the tool schema in `src/agents/tools.test.ts`

**Checkpoint**: US2 passes offline tests for retry limits, validation, and
failure-result behavior.

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate type safety and preserve existing agent-tool behavior.

- [X] T007 Run the provider-status and existing tool tests with `node --import tsx --test src/agents/provider-status.test.ts src/agents/tools.test.ts`, then run `npm run typecheck` and `npm test`; resolve any regressions in `src/agents/provider-status.ts`, `src/agents/provider-status.test.ts`, `src/agents/tools.ts`, or `src/agents/tools.test.ts`

## Dependencies & Execution Order

### Phase Dependencies

- Setup and Foundational have no code changes; the existing project setup is
  already sufficient.
- US1 can begin immediately.
- US2 depends on the status checker and tool entry point from US1.
- Polish depends on the desired user stories being implemented.

### User Story Dependencies

- **US1 (P1)**: No dependency on another story.
- **US2 (P1)**: Builds on the status checker from US1; it is independently
  verifiable after US1 is complete.

### Within Each User Story

- Add the story's tests before its implementation.
- Complete the status-checking module before wiring it into tool dispatch.
- Complete retry behavior before running the final validation task.
- Tests and implementation for the same module are sequential; no safe
  same-story parallel execution is identified.

## Parallel Opportunities

The implementation is a short dependency chain centered on the shared status
checker and tool registry. There are no independent implementation tasks that
can safely run in parallel without editing the same files or depending on the
new checker contract.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T003 to add successful GitHub/Cloudflare status checks and
   register the tool.
2. Stop and validate US1 with fake fetch responses.
3. Continue with US2 so transient and malformed-response handling meets the
   approved resiliency requirements.

### Incremental Delivery

1. Deliver US1 as a usable status lookup with GitHub default and compact output.
2. Deliver US2 with timeout, bounded retry, validation, and safe failure output.
3. Run focused tests, the full test suite, and typecheck.
