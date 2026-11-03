# Implementation Plan: Persistent Operations Store

**Branch**: `004-persistent-operations` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-persistent-operations/spec.md`

## Summary

Replace the PostgreSQL/Sequelize-backed operational records with a persistent
SQLite store using Node.js `node:sqlite` and `DatabaseSync`, injected into
normal application/tool composition. Use four idempotent tables with
database-level closed-value checks, prepared statements for every data query,
and atomic, idempotent sample seeding. Add runbook and incident-listing tools,
extend incident resolution metadata, and run store/tool tests using an
isolated `.memory` connection while preserving mock-backed deterministic
benchmark fixtures.

## Technical Context

**Language/Version**: TypeScript ESM strict; Node.js 22.13+ (Node.js 22 line)
for built-in `node:sqlite` without the experimental command-line flag.

**Primary Dependencies**: Node.js built-in `node:sqlite` `DatabaseSync`,
Express, Zod, LangChain/LangGraph. Remove Sequelize and `pg` when no remaining
runtime use exists; update `package.json`, lockfile, and remove Sequelize-only
type dependencies accordingly.

**Storage**: SQLite file selected by `OPSPILOT_DB`, default
`./data/opspilot.db`; `.memory` selects an isolated in-memory SQLite
connection. Four tables: `services`, `alerts`, `incidents`, and `runbooks`.

**Testing**: `node:test` via `tsx`; `.memory` store/service/tool tests,
existing mock-backed bench tests, `npm run typecheck`, and `npm test`.

**Target Platform**: Node.js 22 LTS on the project's development and server
platforms; filesystem access is required for persistent mode.

**Project Type**: Express HTTP service, agent tool set, and developer
CLI/benchmark in one TypeScript ESM project.

**Performance Goals**: Preserve current operator-facing behavior for the
existing small operational dataset; no additional throughput objective is
specified. Keep database work local and transactions short because
`DatabaseSync` calls execute synchronously.

**Constraints**:

- Follow MVC boundaries; SQLite IO belongs to the store/model boundary and is
  injected into services/tools.
- Every operational data query MUST use a prepared statement with bound
  values. SQL MUST NOT be constructed by concatenating input values. Static
  idempotent DDL and transaction control may use `DatabaseSync.exec()`.
- Enable foreign keys and enforce tier, severity, and status values with SQLite
  `CHECK` constraints as well as boundary validation.
- Use a transaction for seed batches and incident state transitions.
- Do not read `.env` directly or add `dotenv`; use Node's native environment
  support.
- Preserve the mock store for deterministic bench scenarios and tests; normal
  application composition must inject the SQLite store.
- Source currently defines only a partial `IncidentServiceStore`, not an
  `OpsStore` interface. Extract/expand the existing boundary to cover services,
  alerts, incidents, and runbooks.
- Strategy/tool factories currently instantiate tools internally; thread the
  same store through ReAct, plan-and-execute, reflection, HTTP composition, and
  CLI composition to avoid a production path falling back to PostgreSQL or
  mocks.
- `src/bench.ts` currently reads and cleans Sequelize models directly; replace
  those operations with the in-memory benchmark store and keep run-scoped
  cleanup isolated.
- Do not delete unrelated records during repeat seeding.
- `.memory` must not create a disk file; `data/` must be ignored by Git.
- Node 22's SQLite API is still marked experimental/active development; do not
  silently switch to another database if unavailable.

**Scale/Scope**: Four operational tables, five seeded services, six seeded
alerts, three runbooks, incident listing/open/resolve, and five operational
agent tools. No user/account or multi-tenant model is in scope.

## Constitution Check

| Principle/constraint | Gate |
|---|---|
| Explicit MVC layers | PASS — persistence is isolated in `SqliteOpsStore`; services and tool composition receive the store rather than performing IO in the domain or HTTP controller. |
| Validated external boundaries | PASS — tool inputs remain Zod-validated; closed values also receive database CHECK enforcement. |
| Domain errors | PASS — missing records, conflicts, validation, and configuration failures remain explicit domain/boundary errors. |
| Tested changes | PASS — store, seed, incident filters, and tools receive offline tests; typecheck and full tests are required. |
| Security, simplicity, spec-first | PASS — all data values are bound parameters, only four requested tables are used, and this work follows specify/plan/tasks/implement. |
| SQLite technical constraint | PASS — `node:sqlite` is the only persistent operational adapter; no PostgreSQL/Sequelize fallback remains. |

No constitution violations are identified. The synchronous SQLite API is
bounded to local operational data and short transactions.

## Project Structure

### Documentation (this feature)

```text
specs/004-persistent-operations/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ops-tools.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── ops-store.ts                 # Shared operations store contract/types
│   └── sqlite-ops-store.ts          # SQLite schema, prepared queries, CRUD
├── models/
│   └── database.ts                  # SQLite initialization and lifecycle
├── services/
│   ├── incident-service.ts          # Shared store-backed operational logic
│   └── service-fixtures.ts          # Stable service seed fixtures
├── agents/
│   ├── tools.ts                     # Five tool schemas/descriptions and wiring
│   └── tools.test.ts                # Tools run against isolated .memory store
├── app.ts                           # Inject persistent store into composition
├── index.ts                         # Initialize persistent store for runtime
├── bench.ts                         # Use deterministic mock-backed runs
└── *.test.ts                        # Store/service/bench integration coverage

scripts/
└── seed.ts                          # Idempotent operational store seeding

scripts/migrations/
└── 001-alert-severity.sql           # Remove obsolete PostgreSQL migration path

data/                                # Ignored local persistent SQLite files
```

Existing model- or Sequelize-specific test imports, startup/seed scripts,
benchmark persistence queries, migration commands, PostgreSQL environment
configuration, and package dependencies must be updated or removed as
implementation confirms their remaining use. Strategy factories receive the
same injected `OpsStore` through app/CLI composition; do not rely on module
global tool instances for production behavior.

**Structure Decision**: Keep the current single-project MVC structure. Add a
store boundary under `src/store/`, preserve the existing service and agent
layers, and inject the persistent store at app composition. Benchmark-only
fixtures stay in memory and do not depend on production data.

### Post-Design Constitution Check

- The new store is the persistence/model adapter, not an additional domain
 service layer; domain rules remain in services and HTTP translation remains
 in controllers.
- Tool schemas validate external inputs, and the same closed enums are
 enforced in the SQLite schema.
- Data mutations are parameterized and transactional; errors remain explicit.
- The model and store remain limited to the four required operational tables.
- This design remains within the amended SQLite-only stack and project MVC
 boundaries. **PASS**.

## Complexity Tracking

No constitution violations or additional architectural projects require
justification.
