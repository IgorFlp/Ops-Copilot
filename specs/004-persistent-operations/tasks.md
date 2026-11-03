# Tasks: Persistent Operations Store

**Input**: Design documents from `specs/004-persistent-operations/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/ops-tools.md`, and `quickstart.md`

**Organization**: Tasks are grouped by user story to enable independently
verifiable increments. Test tasks are included because the feature specification
explicitly requires isolated `.memory` tests and deterministic tool/benchmark
validation.

## Phase 1: Setup

**Purpose**: Remove obsolete persistence dependencies and prepare local SQLite
configuration.

- [ ] T001 [P] Ignore local SQLite data under `data/` in `.gitignore`.
- [ ] T002 [P] Document `OPSPILOT_DB` and its `./data/opspilot.db` default in `.env.example`.
- [ ] T003 [P] Set the supported Node.js `>=22.13.0` engine in `package.json` and document the built-in SQLite prerequisite in `specs/004-persistent-operations/quickstart.md`.

---

## Phase 2: Foundational

**Purpose**: Establish a shared injectable store contract and SQLite lifecycle
that all user stories depend on.

- [ ] T004 [P] Define domain record types and the complete `OpsStore` contract for services, alerts, incidents, and runbooks in `src/store/ops-store.ts`, preserving the existing `AlertRecord` and `IncidentRecord` output shapes in `src/agents/types.ts`.
- [ ] T005 [P] Replace the Sequelize connection and readiness lifecycle with `DatabaseSync`, `OPSPILOT_DB` path resolution, `.memory` handling, foreign-key activation, and explicit close behavior in `src/models/database.ts`.
- [ ] T006 Add shared store-boundary validation and error mapping for service references and closed values in `src/services/incident-service.ts`.

**Checkpoint**: Shared contract and database lifecycle are ready for story
implementation; no production tool or persistence behavior is complete yet.

---

## Phase 3: User Story 1 - Keep operational records between runs (Priority: P1) 🎯 MVP

**Goal**: Persist service, alert, incident, and runbook data using an
idempotent SQLite schema and repeatable fixtures.

**Independent Test**: Initialize and seed a `.memory` SQLite store twice;
verify four tables, five services, six alerts with the required status/severity
distribution, three runbooks, and no duplicates. Reopen a temporary persistent
database and confirm all stored rows remain available.

### Tests for User Story 1

- [ ] T007 [P] [US1] Test the `.memory` schema, foreign keys, `CHECK` constraints for service tier `tier-1 | tier-2 | tier-3`, alert severity `critical | high | medium | low`, alert status `firing | resolved`, and incident severity/status `critical | high | medium | low` / `open | resolved` in `src/store/sqlite-ops-store.test.ts`.
- [ ] T008 [P] [US1] Test five seeded services, six alerts split into three firing and three resolved with two critical/one high firing and three medium resolved, three requested runbooks, repeated seeding, and preservation of unrelated records in `scripts/seed.test.ts`.
- [ ] T009 [P] [US1] Test that a temporary file-backed store retains services, alerts, incidents, and runbooks after closing and reopening the database in `src/store/sqlite-ops-store.persistence.test.ts`.

### Implementation for User Story 1

- [ ] T010 [US1] Implement idempotent DDL for exactly `services`, `alerts`, `incidents`, and `runbooks`: services have integer primary key, unique non-null slug, non-null name/description/tier and non-null timestamps; alerts have integer primary key, unique non-null fixture key, non-null service foreign key/title/description/status/severity/timestamps; incidents have integer primary key, non-null service foreign key/non-empty title/severity/status/timestamps, nullable summary/resolved_at; runbooks have integer primary key, unique non-null service foreign key, non-null title/content/timestamps, in `src/store/sqlite-ops-store.ts`. Enforce `tier-1 | tier-2 | tier-3`, `critical | high | medium | low`, `firing | resolved`, and `open | resolved` with `CHECK` constraints.
- [ ] T011 [US1] Implement prepared-statement service and alert reads/writes with bound values, stable ordering, and fixture-key upserts that do not delete unrelated rows in `src/store/sqlite-ops-store.ts`.
- [ ] T012 [US1] Add stable fixtures for Payments, Checkout, Inventory, Catalog, and Auth, with `payments-api`, `checkout-api`, and `auth-api` at `tier-1`, `inventory-api` at `tier-2`, and `catalog-api` at `tier-3`, in `src/services/service-fixtures.ts`.
- [ ] T013 [US1] Add six stable Mercadinho alert fixtures in `scripts/seed.ts`, with three firing alerts (two `critical`, one `high`) and three resolved alerts (all `medium`).
- [ ] T014 [US1] Seed the five service fixtures, six alert fixtures, and checkout/payments/auth runbooks atomically with prepared upserts and no destructive reset in `src/store/sqlite-ops-store.ts` and `scripts/seed.ts`.
- [ ] T015 [US1] Replace the existing development startup readiness and seed integration with SQLite initialization and repeatable operational seeding in `src/index.ts`, `src/models/database.ts`, `scripts/seed.ts`, and `package.json`.

**Checkpoint**: SQLite schema and seeded operational records persist and
survive reopening; repeat seed does not duplicate or remove unrelated records.

---

## Phase 4: User Story 2 - Review and manage incidents (Priority: P1)

**Goal**: Open, filter, and resolve incidents with persisted summaries and
resolution timestamps.

**Independent Test**: Open an incident with and without a summary, list
`open`/`resolved`/`all` (defaulting to `open`), resolve it and verify
`resolved_at`, then confirm unknown IDs, repeated resolution, and invalid
closed values fail explicitly.

### Tests for User Story 2

- [ ] T016 [P] [US2] Test incident creation, nullable summary and `resolved_at`, listing filters `open | resolved | all` with default `open`, resolution timestamp, missing service/incident errors, repeated resolution conflict, and invalid severity rejection in `src/store/sqlite-ops-store.test.ts`.
- [ ] T017 [P] [US2] Test the incident service delegates list/open/resolve behavior and preserves explicit domain errors in `src/services/incident-service.test.ts`.

### Implementation for User Story 2

- [ ] T018 [US2] Extend incident records and the `OpsStore` contract with nullable `summary` and `resolvedAt`, and implement prepared incident create/list/resolve methods with transactional `resolved_at` updates in `src/store/ops-store.ts`, `src/agents/types.ts`, and `src/store/sqlite-ops-store.ts`.
- [ ] T019 [US2] Refactor incident service operations to use injected `OpsStore`, preserve normalized service lookup, support default `open` and `open | resolved | all` filters, and return explicit not-found/conflict/validation errors in `src/services/incident-service.ts`.

**Checkpoint**: Incident lifecycle and filtering are independently verifiable
against the SQLite store.

---

## Phase 5: User Story 3 - Consult service runbooks through the operations assistant (Priority: P2)

**Goal**: Expose read-only runbook consultation and incident listing alongside
existing alert and incident tools, with complete and safe tool descriptions.

**Independent Test**: Invoke all five tools using an injected `.memory` store;
verify incident filters and runbook matches/misses, all tool descriptions
explain purpose, when-to-use, every field, enum/default values, and mutation
behavior, and invalid input fails before state changes.

### Tests for User Story 3

- [ ] T020 [P] [US3] Test `list_alerts`, `open_incidente`, `resolve_incidente`, `List_incidentes`, and `consultar_runbook` using an isolated `.memory` `SqliteOpsStore`, including empty/missing results and schema descriptions, in `src/agents/tools.test.ts`.

### Implementation for User Story 3

- [ ] T021 [US3] Implement prepared runbook lookup by normalized service reference, with explicit missing-service/runbook errors, in `src/store/sqlite-ops-store.ts` and `src/services/incident-service.ts`.
- [ ] T022 [US3] Add `List_incidentes` with `status: open | resolved | all` defaulting to `open`, and `consultar_runbook(service)` with non-empty service validation, in `src/agents/tools.ts`.
- [ ] T023 [US3] Revise descriptions and Zod `.describe()` text for all five operational tools and each input field to state purpose, when to use, all fields, closed values/defaults, and read-only or mutation behavior; explicitly restrict `open_incidente` to requests to open/track an incident in `src/agents/tools.ts`.

**Checkpoint**: All operational tools are callable against a shared store and
have complete agent-facing contracts.

---

## Phase 6: User Story 4 - Run deterministic checks without persistent side effects (Priority: P2)

**Goal**: Inject the persistent store in production composition while keeping
tool tests and benchmark scenarios isolated and reproducible in memory.

**Independent Test**: Run all operational tool tests against `.memory`, run
the benchmark against its deterministic in-memory mock twice with network
access disabled, and verify production HTTP/CLI strategy composition shares
the injected persistent store.

### Tests for User Story 4

- [ ] T024 [P] [US4] Test that the five operational tools receive the same injected store and that `.memory` operations never open or modify the configured persistent path in `src/agents/tools.test.ts` and `src/app.test.ts`.
- [ ] T025 [P] [US4] Test deterministic benchmark fixtures, scenario accuracy, and run-scoped cleanup without Sequelize or persistent database reads in `src/bench.test.ts`.

### Implementation for User Story 4

- [ ] T026 [US4] Allow ReAct and plan-and-execute strategy factories and tool invocation to receive the same injected `OpsStore`, preserving module defaults only for compatible standalone callers, in `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and `src/agents/tools.ts`.
- [ ] T027 [US4] Inject the configured `SqliteOpsStore` into chat/arena strategy composition and initialize/close the persistent store through runtime lifecycle in `src/app.ts`, `src/agent/index.ts`, `src/services/arena-service.ts`, and `src/index.ts`.
- [ ] T028 [US4] Replace benchmark's direct Sequelize reads/deletes with its deterministic mock store, preserve run-scoped cleanup, and remove Sequelize persistence imports in `src/bench.ts`.
- [ ] T029 [US4] Update operational examples and exports for new tools/store construction in `src/examples.ts`; after all Sequelize imports are removed, delete obsolete model files `src/models/service.ts`, `src/models/alert.ts`, `src/models/incident.ts`, `scripts/migrate-alert-severity.ts`, and `scripts/migrations/001-alert-severity.sql`, and remove Sequelize, `pg`, Sequelize-only type dependencies, and obsolete migration scripts from `package.json` and `package-lock.json`.

**Checkpoint**: Production paths use the persistent store, and test/benchmark
paths remain deterministic and do not touch the persistent file.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the integrated feature against project quality gates and
document its operational validation steps.

- [ ] T030 [P] Update operational tool and database setup documentation for SQLite location, four-table schema, and runbook/incident-listing usage in `.env.example` and `specs/004-persistent-operations/quickstart.md`.
- [ ] T031 Run `npm run typecheck`, `npm test`, and the persistent/in-memory scenarios in `specs/004-persistent-operations/quickstart.md`; resolve regressions in the corresponding source/test files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No phase dependencies; remove legacy persistence
  dependency paths and establish runtime expectations.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories by
  establishing the store boundary and SQLite lifecycle.
- **User Story 1 (Phase 3)**: Depends on Foundational; delivers schema, seed,
  and restart persistence as the MVP.
- **User Story 2 (Phase 4)**: Depends on US1's incident table and store.
- **User Story 3 (Phase 5)**: Depends on US1's runbook/alert store and US2's
  incident operations.
- **User Story 4 (Phase 6)**: Depends on US1-US3 APIs so production and test
  composition can inject the complete store/tool set.
- **Polish (Phase 7)**: Depends on all accepted stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational. MVP slice; independently proves
  SQLite persistence and repeatable seeding.
- **US2 (P1)**: Depends on US1's database schema and store contract.
- **US3 (P2)**: Depends on US1 and US2 for complete tool backing operations.
- **US4 (P2)**: Depends on US1-US3's store and tools; retains benchmark's
  independent in-memory fixture behavior.

### Within Each User Story

- Write listed tests first and verify they fail for the missing behavior.
- Build schema and persistence methods before service/tool wiring.
- Keep each story independently runnable with its stated test criterion.
- `[P]` tasks touch independent files and have no dependency on another
  incomplete task in the same phase.

### Parallel Opportunities

- Setup T002 and T003 can run independently; T001 owns dependency and legacy
  migration cleanup.
- US1 tests T007-T009 can be prepared in parallel; implementation T012
  (fixtures) can proceed independently from T010/T011 after the store contract.
- US2 T016 and T017 tests can run in parallel; T018 must precede T019.
- US4 tests T024 and T025 touch separate files and can be authored in parallel.
- After the store contract stabilizes, US1 fixture authoring and US2/US3 test
  authoring can be parallelized, but story completion still follows the
  dependency order above.

## Parallel Execution Examples

### User Story 1

```text
Task: T007 - Test schema and closed-value constraints in src/store/sqlite-ops-store.test.ts
Task: T008 - Test idempotent seeded records in src/store/sqlite-ops-store.test.ts
Task: T009 - Test file-backed persistence in src/store/sqlite-ops-store.test.ts
```

### User Story 2

```text
Task: T016 - Test SQLite incident lifecycle and filters in src/store/sqlite-ops-store.test.ts
Task: T017 - Test incident service contract and errors in src/services/incident-service.test.ts
```

### User Story 4

```text
Task: T024 - Test injected tool store isolation in src/agents/tools.test.ts and src/app.test.ts
Task: T025 - Test mock-backed benchmark determinism in src/bench.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Setup and Foundational phases.
2. Complete US1 schema, seed, and file persistence.
3. Validate US1 independently with `.memory` and temporary file-backed stores.
4. Continue to incident lifecycle/filtering, operational tools, then production
   composition and benchmark isolation.

### Incremental Delivery

1. Deliver durable schema and reproducible fixture data.
2. Add incident resolution metadata and status queries.
3. Add runbook and incident-listing tools with explicit descriptions.
4. Wire production composition and retain mock-backed benchmark behavior.
5. Run the complete typecheck, test suite, and quickstart validation.
