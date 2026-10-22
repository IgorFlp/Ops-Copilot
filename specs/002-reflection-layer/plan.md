# Implementation Plan: Reflection Layer

**Branch**: `002-reflection-layer` | **Date**: 2026-10-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-reflection-layer/spec.md`

## Summary

Add `withReflection(strategy, opts)` as a reusable wrapper around the existing
reasoning result contract. It runs the base strategy, evaluates the answer
against trace observations with a structured critic using the configured model,
records the critique, and regenerates with feedback until approval or the
regeneration limit. The default is two regenerations, with a validated range of
0–100. Decorate ReAct and plan-and-execute for explicit arena selection while
preserving the current default arena behavior. Aggregate model-call metrics
across base runs and critiques; measure latency across the full reflected run.

The design keeps reasoning and model concerns in `src/agents`, arena input
validation and selection in the existing controller/service layers, and tests
offline through injected strategy and critic dependencies. Completed
state-changing actions and their observations must be carried between attempts
so a critique-triggered retry does not repeat a successful mutation.

## Technical Context

**Language/Version**: TypeScript ESM, Node.js 22 LTS, strict mode

**Primary Dependencies**: LangChain.js, `@langchain/openai`, LangGraph, Zod, Express

**Storage**: PostgreSQL through Sequelize; no new persistence required

**Testing**: `node:test` via `tsx`; `npm test`; `npm run typecheck`

**Target Platform**: Node.js server and developer CLI on supported Node.js platforms

**Project Type**: HTTP web service with developer CLI and internal reasoning modules

**Performance Goals**: At most 2 additional regenerations by default; each critique
adds one model call. The configured regeneration limit is bounded to 0–100.

**Constraints**: Preserve existing strategy result and unreflected arena behavior;
validate reflection limits before model calls; do not read `.env` in terminal
commands; preserve prior observations and avoid repeating completed mutations;
surface critic and generation failures explicitly.

**Scale/Scope**: Two existing strategies, two reflected variants, one optional
arena request field, one reusable decorator, and deterministic unit/contract tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **MVC boundaries**: PASS — reflection logic belongs in the agent/service
  boundary; HTTP parsing stays in the controller and strategy selection stays
  in the arena service.
- **External input validation**: PASS — validate `maxReflection` with Zod at the
  HTTP boundary and guard decorator options before work starts.
- **Domain errors**: PASS — invalid options and structured critic failures must
  be explicit; HTTP errors remain translated at the existing edge.
- **Testing and quality**: PASS — add deterministic `node:test` coverage and
  preserve project typecheck and test suite.
- **Security and operations**: PASS — keep configured credentials in runtime
  configuration; surface failed calls; prevent duplicate completed mutations
  during retries.
- **Spec-first workflow**: PASS — this plan and design precede task generation
  and implementation.
- **Small/pure/reversible changes**: PASS — add one decorator and its focused
  tests; reuse existing model, schema, and arena patterns; no database migration.

## Project Structure

### Documentation (this feature)

```text
specs/002-reflection-layer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── arena-api.yaml
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── reflection.ts
│   ├── reflection.test.ts
│   ├── types.ts
│   ├── react.ts
│   └── plan-and-execute.ts
├── controllers/
│   ├── arena-controller.ts
│   └── arena-controller.test.ts
└── services/
    ├── arena-service.ts
    └── arena-service.test.ts

src/
├── arena-cli.ts
├── arena-cli.test.ts
└── arena.ts

specs/002-reflection-layer/
└── contracts/
    └── arena-api.yaml
```

**Structure Decision**: Extend the existing single Node.js project. The decorator
and shared strategy contracts belong in `src/agents`; HTTP schema and service
selection remain in their MVC layers. The developer CLI uses the same arena
service and exposes the same reflected strategy names and bound. Tests follow
the current colocated `*.test.ts` convention. No new package, persistent model,
or migration is needed.

## Complexity Tracking

No constitution violations or additional architectural projects are proposed.
