# Tasks: Context Section Budgeting

**Input**: Design documents from `specs/012-context-section-budgeting/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/context-builder.ts`, `quickstart.md`

**Tests**: Included because FR-008 explicitly requires automated coverage.

**Organization**: Tasks are grouped by user story after shared setup and foundational context-builder utility.

## Phase 1: Setup

**Purpose**: Verify the existing project setup supports the planned work.

- [X] T001 [P] Verify the existing Node.js, TypeScript, and test-script configuration in `package.json` supports the feature without adding dependencies.

---

## Phase 2: Foundational

**Purpose**: Create the pure ContextBuilder utility with budget reading, token estimation, and section truncation logic.

- [X] T002 [P] Add unit tests for budget config parsing: valid numeric values, invalid/non-numeric values (fallback to defaults), zero/negative values (unlimited), missing env vars (defaults) in `src/context/context-builder.test.ts`.
- [X] T003 [P] Add unit tests for truncation strategies: summary (truncate-end at token boundary), window (drop-oldest preserving order), memories (drop-lowest-score preserving order of remaining), untouchable sections never modified in `src/context/context-builder.test.ts`.
- [X] T004 [P] Add unit tests for token estimation integration: uses existing `estimateTokens`, per-section estimation, non-negative integers, Unicode code point counting in `src/context/context-builder.test.ts`.
- [X] T005 Implement `readBudgetConfig()` parsing `CONTEXT_BUDGET_*` env vars with defaults (summary: 200, window: 1200, memories: 300, system/userMessage: unlimited) in `src/context/context-builder.ts`.
- [X] T006 Implement `truncateSection()` for each strategy: summary truncates content from end, window removes oldest messages first, memories sorts by score asc and drops lowest, untouchable sections return unchanged in `src/context/context-builder.ts`.
- [X] T007 Implement `ContextBuilder.build()` assembling sections in order (system, summary, window, memories, userMessage), applying budgets independently, returning `ContextBuilderOutput` with prompt, sections, totalEstimatedTokens, truncatedSections in `src/context/context-builder.ts`.
- [X] T008 Export `createContextBuilder()` factory and types from `src/context/context-builder.ts` and add barrel export in `src/context/index.ts` if exists.

**Checkpoint**: ContextBuilder is a pure, tested utility ready for integration.

---

## Phase 3: User Story 1 - Build prompt with section budgets (Priority: P1) 🎯 MVP

**Goal**: Construct prompts for all strategies with configurable token budgets per section via environment variables.

**Independent Test**: Set CONTEXT_BUDGET_* environment variables, invoke ContextBuilder with multiple strategies, verify each section respects its budget and the final prompt stays within total limits.

### Tests for User Story 1

- [X] T009 [P] [US1] Add ChatService integration tests: strategy input passed through ContextBuilder, contextBreakdown reflects post-truncation estimates, works with both "react" and "plan-and-execute" strategies in `src/services/chat-service.test.ts`.
- [X] T010 [P] [US1] Add tests for default budgets (summary: 200, window: 1200, memories: 300): oversized sections truncated per strategy, untouchable sections intact in `src/services/chat-service.test.ts`.
- [X] T011 [P] [US1] Add tests for MemoryEntry score-based truncation: memories sorted by score, lowest dropped first, order of remaining preserved in `src/services/chat-service.test.ts`.

### Implementation for User Story 1

- [X] T012 [US1] Integrate ContextBuilder into `formatStrategyInput()` in `src/agents/types.ts`: accept ChatStrategyInput, build ContextBuilderInput, call ContextBuilder.build(), return budgeted prompt string.
- [X] T013 [US1] Update ChatService to use budgeted prompt from formatStrategyInput and ensure metrics.contextBreakdown reflects post-truncation section tokens in `src/services/chat-service.ts`.
- [X] T014 [P] [US1] Verify React strategy receives budgeted prompt and works end-to-end in `src/agents/react.test.ts`.
- [X] T015 [P] [US1] Verify Plan-and-Execute strategy receives budgeted prompt and works end-to-end in `src/agents/plan-and-execute.test.ts`.

**Checkpoint**: User Story 1 works independently for all strategies with default and custom budgets.

---

## Phase 4: User Story 2 - Verify truncation order with low budgets (Priority: P1)

**Goal**: Verify that when budgets are set very low, sections are truncated in the correct priority order.

**Independent Test**: Set all CONTEXT_BUDGET_* variables to very low values, invoke ContextBuilder with a large context, verify truncation occurs in expected order: summary first, then window (oldest), then memories (lowest score), while system prompt and message remain untouched.

### Tests for User Story 2

- [X] T016 [P] [US2] Add priority order tests: minimal budgets (e.g., 10 each), verify system/userMessage never truncated, summary truncated first, window drops oldest second, memories drops lowest-score third in `src/context/context-builder.test.ts`.
- [X] T017 [P] [US2] Add test for truncatedSections array order: ["summary", "window", "memories"] when all three are truncated in `src/context/context-builder.test.ts`.
- [X] T018 [P] [US2] Add test for unlimited budgets (0, negative, unset): no truncation, truncatedSections empty, all content included in `src/context/context-builder.test.ts`.

### Implementation for User Story 2

- [X] T019 [US2] Verify priority order behavior is already implemented correctly (no code changes needed if T006/T007 are correct); add integration test in `src/services/chat-service.test.ts` with minimal budgets across full chat flow.

**Checkpoint**: User Story 2 validates truncation priority order with extreme budgets.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Keep the validation guide aligned with the contract and run the project's required checks.

- [X] T020 [P] Update the focused test commands and expected metric behaviors to match the implemented contract in `specs/012-context-section-budgeting/quickstart.md`.
- [X] T021 Run the focused feature tests, `npm run typecheck`, and `npm test` from the scripts in `package.json`; resolve any regressions in affected files under `src/` and `scripts/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; confirm the existing runtime and test configuration.
- **Foundational (Phase 2)**: Depends on setup; T005-T008 depend on T002-T004 (tests first) and block integration.
- **User Story 1 (Phase 3)**: Depends on foundational ContextBuilder (T005-T008). T009-T011 (tests) can be authored in parallel with T012-T013 (implementation).
- **User Story 2 (Phase 4)**: Depends on ContextBuilder implementation (T005-T008). Tests T016-T018 can be authored in parallel with US1 work.
- **Polish (Phase 5)**: Depends on both user stories being implemented.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; delivers budgeted prompts for all strategies (MVP).
- **User Story 2 (P1)**: Can be validated independently after Phase 2; tests verify priority order logic already implemented in foundational phase.

### Task Dependency Graph

```text
T001 -> T002, T003, T004 -> T005, T006, T007, T008
T008 -> T009, T010, T011, T012, T013, T014, T015
T008 -> T016, T017, T018, T019
T013, T015, T019 -> T020 -> T021
```

### Parallel Opportunities

- **Foundational**: T002, T003, T004 edit the same test file but cover independent behaviors (config parsing, truncation strategies, estimation) and can be authored in parallel.
- **Foundational implementation**: T005, T006, T007 are sequential within context-builder.ts but T008 (barrel export) is independent.
- **User Story 1 tests**: After T008, T009, T010, T011 edit separate test files and can be authored in parallel.
- **User Story 1 implementation**: T012 (types.ts) enables T013 (chat-service.ts); T014 and T015 (strategy tests) are independent and can proceed in parallel after T012.
- **User Story 2 tests**: T016, T017, T018 are independent test additions in context-builder.test.ts and can be authored in parallel with US1 work.
- **Polish**: T020 follows both stories; T021 is the final verification gate.

## Parallel Example: User Story 1

```text
After T008, author independent tests in parallel:
- T009 chat-service integration in `src/services/chat-service.test.ts`
- T010 default budgets in `src/services/chat-service.test.ts`
- T011 memory score truncation in `src/services/chat-service.test.ts`

After T012 (formatStrategyInput integration):
- T013 ChatService metrics update in `src/services/chat-service.ts`
- T014 React strategy test in `src/agents/react.test.ts` (parallel)
- T015 Plan-and-Execute strategy test in `src/agents/plan-and-execute.test.ts` (parallel)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete setup and foundational ContextBuilder utility (Phases 1-2).
2. Complete User Story 1 tests and integration (Phase 3).
3. Validate budgeted prompts work for all strategies with deterministic tests before verifying priority order.

### Incremental Delivery

1. Deliver User Story 1 as the first independently testable increment (budgeted prompts for all strategies).
2. Deliver User Story 2 (priority order validation with extreme budgets).
3. Update the quickstart and require focused tests, typecheck, and the full test suite to pass before completion.