# Implementation Plan: Context Token Metrics

**Current Branch**: `main` | **Feature Branch Name**: `010-context-token-metrics`
| **Date**: 2026-11-05 | **Spec**: [spec.md](./spec.md)

## Summary

Expose actual prompt-token usage separately from character-based estimates for
the current request, prior conversation history, and retrieved memories. Sum
reported input-token usage across all model invocations for a chat run, but
omit the total if any invocation lacks provider usage. Add focused tests and
preserve the existing long-conversation script's per-turn usage output.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22.17.0 in the
workspace (`package.json` requires >=22.13.0).

**Primary Dependencies**: `@langchain/core` 1.2.17, `@langchain/langgraph`
1.5.0, `@langchain/openai` 1.6.2, Express, and Zod. These dependencies are
already installed; no dependency changes are planned.

**Storage**: None for the new measurements. Conversation persistence remains
unchanged.

**Testing**: `node:test` via `tsx`; focused test files plus
`npm run typecheck` and `npm test`.

**Target Platform**: Node.js 22.13+ service and the existing Bash-based
long-conversation exercise.

**Project Type**: Express web service with agent strategies and a Bash
development script.

**Performance Goals**: Estimation is linear in source-text length and adds no
model requests or persistence operations.

**Constraints**: Estimates use Unicode code points and are rounded down once
per source. Actual prompt usage is a sum across model invocations, but is
omitted if any invocation's actual usage is unavailable. Tests must not call a
live provider or require credentials. Do not overwrite or discard the existing
untracked `scripts/conversa-longa.sh`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Assessment |
|---|---|---|
| I. Explicit MVC Layers | Keep transport concerns in controllers, chat assembly in services, and estimation in a pure context utility. | PASS |
| II. Validated External Boundaries | No new external request input; preserve existing Zod validation. | PASS |
| III. Domain Errors | Usage metadata is optional diagnostic information; malformed/missing provider metadata must not become a fabricated success value. Existing chat failure translation remains unchanged. | PASS |
| IV. Tested Changes | Add deterministic unit and integration coverage, then run typecheck and tests during implementation. | PASS |
| V. Security, Simplicity, and Spec-First Development | No secrets, persistence, dependencies, or extra model calls; following specify-plan-tasks-implement. | PASS |

No pre-research gate violations.

## Project Structure

### Documentation (this feature)

```text
specs/010-context-token-metrics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts
│   └── tokens.test.ts
├── agents/
│   ├── types.ts
│   ├── react.ts
│   ├── react.test.ts
│   ├── plan-and-execute.ts
│   ├── plan-and-execute.test.ts
│   ├── reflection.ts
│   └── reflection.test.ts
├── services/
│   ├── chat-service.ts
│   └── chat-service.test.ts
└── controllers/
    └── chat-controller.test.ts

scripts/
├── conversa-longa.sh
└── conversa-longa.test.ts
```

**Structure Decision**: Add a pure estimator under `src/context/`. Keep source
breakdown assembly in `ChatService`, which owns the current request, selected
history, and retrieved memories. Carry actual model usage through strategy
results so `/chat` can expose the aggregate without coupling the service to
LangChain message classes. Update the existing OpenAPI contract. The
long-conversation script is already untracked in the worktree and must be
preserved while its output behavior is tested.

## Complexity Tracking

No constitution violations require justification.

## Post-Design Constitution Check

All Phase 1 artifacts preserve the MVC boundaries, keep estimation pure, define
only additive response metrics, and introduce no persistence or provider
network access into tests. All gates pass.
