# Feature Specification: Context Section Budgeting

**Feature Branch**: `012-context-section-budgeting`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: ContextBuilder with section budget: src/context/context-builder.ts builds the prompt for ALL strategies with section ceiling via env CONTEXT_BUDGET_: system prompt and message untouchable, summary 200, window 1200 (cuts oldest), memories 300 (cuts lowest score). Test: low ceilings cut in the right order.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build prompt with section budgets (Priority: P1)

As a developer using the ContextBuilder, I want to construct prompts for all strategies with configurable token budgets per section via environment variables, so that I can control context size without modifying code.

**Why this priority**: Configurable budgets enable flexible context management across different deployment environments and model constraints.

**Independent Test**: Set CONTEXT_BUDGET_* environment variables, invoke ContextBuilder with multiple strategies, verify each section respects its budget and the final prompt stays within total limits.

**Acceptance Scenarios**:

1. **Given** CONTEXT_BUDGET_SYSTEM and CONTEXT_BUDGET_MESSAGE are not set (or set to unlimited), **When** ContextBuilder builds the prompt, **Then** the system prompt and user message are included in full without truncation.
2. **Given** CONTEXT_BUDGET_SUMMARY=200, **When** the summary section exceeds 200 tokens, **Then** the summary is truncated to fit within 200 tokens.
3. **Given** CONTEXT_BUDGET_WINDOW=1200, **When** the conversation window exceeds 1200 tokens, **Then** the oldest messages are removed first until the window fits within 1200 tokens.
4. **Given** CONTEXT_BUDGET_MEMORIES=300, **When** the memories section exceeds 300 tokens, **Then** the lowest-scored memories are removed first until the memories fit within 300 tokens.
5. **Given** multiple section budgets are set, **When** ContextBuilder builds the prompt, **Then** each section is processed independently according to its budget and truncation strategy.

### User Story 2 - Verify truncation order with low budgets (Priority: P1)

As a developer, I want to verify that when budgets are set very low, sections are truncated in the correct priority order, so that I can trust the budgeting logic under extreme constraints.

**Why this priority**: Correct truncation order ensures the most important context is preserved when space is severely limited.

**Independent Test**: Set all CONTEXT_BUDGET_* variables to very low values, invoke ContextBuilder with a large context, verify truncation occurs in the expected order: summary first, then window (oldest), then memories (lowest score), while system prompt and message remain untouched.

**Acceptance Scenarios**:

1. **Given** all budgets set to minimal values, **When** ContextBuilder builds the prompt, **Then** the system prompt and user message are never truncated regardless of budget settings.
2. **Given** CONTEXT_BUDGET_SUMMARY=10, **When** the summary exceeds 10 tokens, **Then** the summary is truncated before any other section is affected.
3. **Given** CONTEXT_BUDGET_WINDOW=50, **When** the window exceeds 50 tokens, **Then** the oldest messages are removed before memories are truncated.
4. **Given** CONTEXT_BUDGET_MEMORIES=20, **When** memories exceed 20 tokens, **Then** the lowest-scored memories are removed last among the budgeted sections.

### Edge Cases

- A budget set to 0 or negative value is treated as "no limit" for that section.
- An unset budget environment variable defaults to no limit for that section.
- If the system prompt alone exceeds typical model limits, it is still included in full (untouchable).
- If the user message alone exceeds typical model limits, it is still included in full (untouchable).
- When multiple truncation strategies apply, each operates independently on its section.
- Token counting uses the project's existing token estimation method (Unicode code points / 4, rounded down).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The ContextBuilder MUST read section budgets from environment variables prefixed with `CONTEXT_BUDGET_` (e.g., `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW`, `CONTEXT_BUDGET_MEMORIES`).
- **FR-002**: The system prompt and user message sections MUST be treated as untouchable and MUST never be truncated regardless of budget settings.
- **FR-003**: The summary section MUST respect `CONTEXT_BUDGET_SUMMARY` (default: 200 tokens) and truncate content when exceeding the budget.
- **FR-004**: The conversation window section MUST respect `CONTEXT_BUDGET_WINDOW` (default: 1200 tokens) and remove the oldest messages first when exceeding the budget.
- **FR-005**: The memories section MUST respect `CONTEXT_BUDGET_MEMORIES` (default: 300 tokens) and remove the lowest-scored memories first when exceeding the budget.
- **FR-006**: Each section's truncation MUST operate independently; truncating one section MUST NOT affect the content of other sections beyond token budget allocation.
- **FR-007**: The ContextBuilder MUST support building prompts for ALL registered strategies with the same budget configuration.
- **FR-008**: Automated tests MUST verify that with low budgets, truncation occurs in the correct order: summary → window (oldest) → memories (lowest score), while system prompt and message remain intact.
- **FR-009**: Token estimation MUST use the project's existing character-based method (1 token ≈ 4 Unicode code points, rounded down).

### Key Entities

- **ContextBuilder**: The component responsible for assembling the final prompt from multiple context sections.
- **Section Budget**: A token limit for a specific context section, configurable via environment variable.
- **Truncation Strategy**: The rule for reducing a section's content when it exceeds its budget (summary: truncate content; window: drop oldest; memories: drop lowest score).
- **Untouchable Sections**: System prompt and user message, which are never truncated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With default budgets (summary: 200, window: 1200, memories: 300), a prompt with oversized sections is correctly truncated per section strategy.
- **SC-002**: With all budgets set to minimal values (e.g., 10 tokens each), the system prompt and user message remain fully included while other sections are truncated in priority order.
- **SC-003**: Each section's truncation strategy is independently verifiable: summary truncates content, window drops oldest messages, memories drop lowest-scored entries.
- **SC-004**: The ContextBuilder works correctly for all registered strategies without strategy-specific budget configuration.
- **SC-005**: Token counts for each section match the project's estimation method (Unicode code points / 4, rounded down).

## Assumptions

- The existing token estimation utility (`src/context/tokens.ts`) provides the character-based estimation method.
- Environment variables are read at ContextBuilder initialization or prompt build time.
- The ContextBuilder is used by all agent strategies (React, Plan-and-Execute, etc.) for prompt construction.
- "Untouchable" means the content is included verbatim without any truncation or modification, even if it exceeds model context limits.
- Default budgets (summary: 200, window: 1200, memories: 300) are reasonable starting points for typical conversations.
- The order of section assembly in the final prompt is: system prompt → summary → window → memories → user message.