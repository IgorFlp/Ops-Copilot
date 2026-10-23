# Implementation Plan: OpsPilot Reasoning Arena

**Branch**: `001-reasoning-arena` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-reasoning-arena/spec.md`

## Summary

Implement a shared reasoning result and trace contract, a single deterministic OpenRouter model factory, and persistent incident/alert tools over the project's PostgreSQL datastore. Add bounded ReAct and plan-and-execute strategies and expose their comparison through both an HTTP endpoint and a developer CLI integrated with the existing Express application. Provide repeatable sample data, alert severity, an accuracy-checked benchmark for three operational scenarios, and deterministic offline tests.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Express, Zod, Sequelize, PostgreSQL (`pg`), LangChain/LangGraph, `@langchain/openai`; existing `tsx` and `node:test` workflow

**Storage**: PostgreSQL, accessed through Sequelize; services, alerts (including severity), and incidents are persistent operational records

**Testing**: `npm run typecheck`; `npm test` using `node:test` via `tsx`; store and trace-format tests use deterministic fixtures and no provider network

**Target Platform**: Node.js 22 service; local development and deployment environments with PostgreSQL and OpenRouter credentials

**Project Type**: HTTP web service with an HTTP reasoning arena endpoint and a developer CLI for local strategy tests

**Performance Goals**: No provider-independent latency SLA is specified. Measure elapsed strategy latency and LLM-call counts; enforce configured iteration and eight-step plan bounds. Benchmark accuracy is checked against persisted state.

**Constraints**: Keep the existing strict ESM/TypeScript and MVC boundaries. Validate HTTP inputs with Zod, isolate database IO in models/services, surface failures explicitly, do not add `dotenv`, and do not expose private chain-of-thought. The plan-and-execute strategy considers at most eight steps and can optionally skip replanning for benchmark runs. Alert severity is added through a versioned SQL migration. The sample seed must be repeatable and must not remove unrelated records; benchmark cleanup removes only its own incidents.

**Scale/Scope**: One minimal arena endpoint; one developer arena CLI; a three-scenario/two-strategy benchmark CLI; three operational tools; five seeded services, six seeded alerts, and the incident records created by tool use.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Evidence / design response |
|---|---|---|
| Explicit MVC layers | PASS | HTTP route/controller validate and delegate; services coordinate strategy and domain operations; Sequelize models encapsulate PostgreSQL persistence. |
| Validated HTTP and developer CLI boundaries | PASS | Arena and operational HTTP inputs are validated with Zod; CLI flags and values are validated before database or strategy execution. The user explicitly corrected the earlier HTTP-only decision; CLI supplements rather than replaces HTTP. |
| Domain errors | PASS | Predictable service/tool failures use domain errors and are translated to appropriate HTTP error responses; internal error details are not returned as success. |
| Tests with new logic | PASS | Add deterministic `node:test` coverage and retain `npm run typecheck` and `npm test` as required checks. |
| Security by default | PASS | Read credentials only from runtime environment; do not add secrets or `dotenv`; fail explicitly for missing model configuration or operational failures. |
| Spec before code | PASS | This plan follows the approved feature specification and precedes task generation and implementation. |
| Small, pure, reversible | PASS | Keep strategy orchestration separate from persistence and HTTP IO; use focused modules and fixture-scoped seed upserts. |

**Pre-design gate result**: PASS. The user explicitly clarified that both HTTP and a developer CLI are required; this is a documented amendment to the previous HTTP-only scope.

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
├── arena.ts                         # CLI entry point for local arena runs
├── arena-cli.ts                     # CLI argument parsing and output formatting
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
├── seed.ts                            # Idempotent fixture seed entry point
└── migrations/
    └── 001-alert-severity.sql         # Versioned alert severity migration

src/
├── bench.ts                           # Accuracy-checked strategy benchmark CLI
└── *.test.ts                          # node:test unit tests for store/tools/trace/benchmark
```

**Structure Decision**: Use the existing single TypeScript service and its Express, Sequelize, LangGraph, and test dependencies. Keep the HTTP API and developer arena CLI. Add a separate benchmark entry point that runs existing strategies against the operational store, checks scenario-specific state, prints a consolidated table, and cleans only its uniquely tagged incident records. Apply alert schema changes through a versioned SQL migration and preserve deterministic offline tests.

## Complexity Tracking

No constitution violations or exceptional complexity require justification.
