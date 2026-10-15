# Implementation Plan: OpsPilot Reasoning Arena

**Branch**: `001-reasoning-arena` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-reasoning-arena/spec.md`

## Summary

Implement a shared reasoning result and trace contract, a single deterministic OpenRouter model factory, and persistent incident/alert tools over the project's PostgreSQL datastore. Add bounded ReAct and plan-and-execute strategies and expose their comparison through an HTTP endpoint integrated into the existing Express application. The explicit constitution constraint against a CLI is respected: the requested CLI arena is replaced by a validated HTTP operation. Provide repeatable sample data and deterministic offline tests.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Express, Zod, Sequelize, PostgreSQL (`pg`), LangChain/LangGraph, `@langchain/openai`; existing `tsx` and `node:test` workflow

**Storage**: PostgreSQL, accessed through Sequelize; services, alerts, and incidents are persistent operational records

**Testing**: `npm run typecheck`; `npm test` using `node:test` via `tsx`; store and trace-format tests use deterministic fixtures and no provider network

**Target Platform**: Node.js 22 service; local development and deployment environments with PostgreSQL and OpenRouter credentials

**Project Type**: HTTP web service with an HTTP reasoning arena endpoint; no CLI surface

**Performance Goals**: No provider-independent latency SLA is specified. Measure elapsed strategy latency and enforce configured iteration and eight-step plan bounds.

**Constraints**: Keep the existing strict ESM/TypeScript and MVC boundaries. Validate HTTP inputs with Zod, isolate database IO in models/services, surface failures explicitly, do not add `dotenv`, and do not expose private chain-of-thought. The plan-and-execute strategy considers at most eight steps. The sample seed must be repeatable and must not remove unrelated records.

**Scale/Scope**: One minimal arena endpoint; two strategies; three operational tools; five seeded services, six seeded alerts, and the incident records created by tool use.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Evidence / design response |
|---|---|---|
| Explicit MVC layers | PASS | HTTP route/controller validate and delegate; services coordinate strategy and domain operations; Sequelize models encapsulate PostgreSQL persistence. |
| Zod at HTTP boundaries; no CLI | PASS | Arena and operational HTTP inputs are validated at the HTTP boundary. The user chose to replace the CLI with HTTP, so no CLI is introduced. |
| Domain errors | PASS | Predictable service/tool failures use domain errors and are translated to appropriate HTTP error responses; internal error details are not returned as success. |
| Tests with new logic | PASS | Add deterministic `node:test` coverage and retain `npm run typecheck` and `npm test` as required checks. |
| Security by default | PASS | Read credentials only from runtime environment; do not add secrets or `dotenv`; fail explicitly for missing model configuration or operational failures. |
| Spec before code | PASS | This plan follows the approved feature specification and precedes task generation and implementation. |
| Small, pure, reversible | PASS | Keep strategy orchestration separate from persistence and HTTP IO; use focused modules and fixture-scoped seed upserts. |

**Pre-design gate result**: PASS. No unresolved technical clarifications; the CLI/constitution conflict was resolved by the user in favor of HTTP.

## Project Structure

### Documentation (this feature)

```text
specs/001-reasoning-arena/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── arena-api.yaml
└── tasks.md              # Generated in the next phase
```

### Source Code (repository root)

```text
src/
├── index.ts                         # HTTP server startup
├── app.ts                            # Express app assembly
├── agents/
│   ├── model.ts                      # Single OpenRouter model factory
│   ├── types.ts                      # Shared strategy, trace, and metrics types
│   ├── tools.ts                      # Validated operational tools
│   ├── react.ts                      # ReAct strategy
│   └── plan-and-execute.ts           # Bounded graph strategy
├── controllers/
│   └── arena-controller.ts           # HTTP boundary and response mapping
├── routes/
│   └── arena-routes.ts                # Arena endpoint registration
├── models/
│   ├── database.ts                   # Sequelize connection
│   ├── service.ts
│   ├── alert.ts
│   └── incident.ts
├── services/
│   ├── arena-service.ts              # Run selected strategies over shared input
│   └── incident-service.ts           # Operational domain operations
└── lib/
    └── trace-format.ts                # Deterministic trace serialization/formatting

scripts/
└── seed.ts                            # Idempotent fixture seed entry point

src/
└── *.test.ts                          # node:test unit tests for store/tools/trace
```

**Structure Decision**: Use the existing single TypeScript service and its Express, Sequelize, LangGraph, and test dependencies. The repository currently has an empty `src/index.ts` and no established model/controller/service modules, so establish only the small MVC structure required by the constitution and keep strategy logic separate. Keep the arena as HTTP orchestration, not a terminal command; remove or replace the currently dangling `arena` npm script that points to the requested-but-prohibited `src/arena.ts` CLI. Add an explicit seed script entry point.

## Complexity Tracking

No constitution violations or exceptional complexity require justification.
