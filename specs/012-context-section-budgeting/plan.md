# Implementation Plan: Context Section Budgeting

**Current Branch**: `main` | **Feature Branch Name**: `012-context-section-budgeting`
| **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

## Summary

Add a `ContextBuilder` utility that constructs prompts for all strategies with configurable token budgets per section via environment variables (`CONTEXT_BUDGET_*`). System prompt and user message are untouchable. Summary truncates content, window drops oldest messages, memories drop lowest-scored entries. Tests verify low budgets truncate in the correct priority order.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22.17.0 in the workspace (`package.json` requires >=22.13.0).

**Primary Dependencies**: `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, Express, and Zod. These dependencies are already installed; no dependency changes are planned.

**Storage**: None for the new budgeting logic. Conversation persistence remains unchanged.

**Testing**: `node:test` via `tsx`; focused test files plus `npm run typecheck` and `npm test`.

**Target Platform**: Node.js 22.13+ service.

**Project Type**: Express web service with agent strategies.

**Performance Goals**: Budget enforcement is linear in section content length and adds no model requests or persistence operations.

**Constraints**: 
- Budgets read from `CONTEXT_BUDGET_*` environment variables at build time
- Token estimation uses existing `estimateTokens` (Unicode code points / 4, floor)
- System prompt and user message are never truncated regardless of budget
- Each section's truncation operates independently
- Must work for all registered strategies (React, Plan-and-Execute, etc.)
- Tests must not call a live provider or require credentials

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Assessment |
|---|---|---|
| I. Explicit MVC Layers | Keep budget configuration reading in a pure utility, context assembly in services, truncation logic in the utility. | PASS |
| II. Validated External Boundaries | Environment variables validated with defaults; no new external request input. | PASS |
| III. Domain Errors | Invalid budget values use safe defaults; missing budgets default to no limit. | PASS |
| IV. Tested Changes | Add deterministic unit tests for each truncation strategy and priority order. | PASS |
| V. Security, Simplicity, and Spec-First Development | No secrets, persistence, dependencies, or extra model calls; following specify-plan-tasks-implement. | PASS |

No pre-research gate violations.

## Project Structure

### Documentation (this feature)

```text
specs/012-context-section-budgeting/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── context-builder.ts (interface definition)
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts              # existing: estimateTokens
│   ├── tokens.test.ts
│   ├── history-summary.ts     # existing: history selection
│   ├── history-summary.test.ts
│   ├── context-builder.ts     # NEW: budget-aware prompt assembly
│   └── context-builder.test.ts
├── agents/
│   ├── types.ts               # existing: formatStrategyInput, ChatStrategyInput
│   ├── react.ts
│   ├── react.test.ts
│   ├── plan-and-execute.ts
│   ├── plan-and-execute.test.ts
│   └── ...
├── services/
│   ├── chat-service.ts        # existing: builds strategy input
│   └── chat-service.test.ts
└── ...
```

**Structure Decision**: Create a new `ContextBuilder` class under `src/context/` that encapsulates budget reading, token estimation, and section truncation. The `formatStrategyInput` function in `types.ts` will delegate to `ContextBuilder`. `ChatService` will continue to assemble the strategy input but the final prompt formatting will use the budget-aware builder. This keeps the budget logic pure and testable while integrating cleanly with existing strategy flows.

## Complexity Tracking

No constitution violations require justification.

## Post-Design Constitution Check

All Phase 1 artifacts preserve the MVC boundaries, keep budget logic pure, introduce no persistence or provider network access into tests, and follow the existing pattern of environment variable configuration. All gates pass.