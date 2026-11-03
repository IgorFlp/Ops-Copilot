# Research: Persistent Operations Store

## Decisions

### SQLite access

- **Decision**: Use Node.js 22's built-in `node:sqlite` `DatabaseSync` as the
  synchronous persistence adapter. Keep database access behind the operational
  store interface and inject that store into the agent-tool composition.
- **Rationale**: This meets the project constitution, avoids a third-party
  database dependency, and provides a direct way to use the same schema and
  behavior with a disk database and an isolated in-memory connection.
- **Alternatives considered**: Continue using Sequelize/PostgreSQL (conflicts
  with the amended constitution); add a separate SQLite driver (unnecessary
  dependency when the runtime has a built-in module).
- **Evidence**: The [Node.js v22 SQLite API](https://nodejs.org/docs/latest-v22.x/api/sqlite.html)
  documents `DatabaseSync`, `database.prepare()`, bound statement parameters,
  and `:memory:` databases.

### Runtime compatibility

- **Decision**: Require a current Node.js 22 release with `node:sqlite`
  available without an experimental command-line flag; record the exact
  minimum during implementation validation.
- **Rationale**: `node:sqlite` was added in Node 22.5.0. In Node 22.13.0 it no
  longer requires `--experimental-sqlite`, but remains marked as active
  development/experimental. The feature must not silently fall back to another
  persistence engine.
- **Alternatives considered**: Add `--experimental-sqlite` to all runtime
  commands (unnecessary on newer Node 22); use a third-party SQLite package
  (not required by the mandated stack).
- **Evidence**: Node.js v22 API history marks removal of the flag at v22.13.0
  and lists SQLite as Stability 1.1.

### Database location and test isolation

- **Decision**: Read the persistent database location from `OPSPILOT_DB`,
  defaulting to `./data/opspilot.db`; interpret the requested `.memory`
  location as an isolated `DatabaseSync(':memory:')` connection for tests.
- **Rationale**: The application can persist across restarts while the same
  store implementation can be instantiated without a filesystem side effect.
  Keep the existing in-memory mock available for deterministic benchmark
  scenarios.
- **Alternatives considered**: Create a disk-backed `.memory` database file
  (not isolated and risks stale test state); make tests default to the
  production database (risks contaminating operator data).

### Schema and seed

- **Decision**: Create four idempotent tables—`services`, `alerts`,
  `incidents`, and `runbooks`—with foreign keys and database-level `CHECK`
  constraints for tier, severity, and status. Seed stable fixtures using unique
  identifiers in a transaction.
- **Rationale**: The schema directly models the operational entities and
  closed domain values; stable fixture keys make repeated seed runs
  deterministic without deleting unrelated data.
- **Alternatives considered**: Rely only on TypeScript/Zod validation (does not
  protect persisted records from invalid writes); destructive database resets
  during seed (would remove operator-created data).
- **Seed assumptions**: The repository has no Mercadinho seed. Preserve the
  existing five-service count by replacing Orders with Auth, retain the
  established two-critical/one-high firing alerts and three-medium resolved
  alerts. Seed `payments-api`, `checkout-api`, and `auth-api` as `tier-1`,
  `inventory-api` as `tier-2`, and `catalog-api` as `tier-3`: this reflects
  their assumed relative impact if unavailable while exercising all closed
  tier values. Use stable fixture keys and descriptive replacement auth
  alert/runbook content consistent with the existing sample tone.

### Transactions and query safety

- **Decision**: Prepare all data reads and writes with `DatabaseSync.prepare()`
  and bound parameters. Use transactions for seed batches and multi-step
  incident mutations. Limit `database.exec()` to static idempotent DDL and
  fixed transaction/control statements.
- **Rationale**: Parameter binding separates values from SQL; transactions
  keep related state changes atomic.
- **Alternatives considered**: Interpolating values into SQL strings (unsafe
  and disallowed by the feature request); issuing related writes independently
  (can leave partial state).

### Application composition and mock behavior

- **Decision**: Construct the persistent `SqliteOpsStore` for normal
  application/tool composition. Retain the existing in-memory mock/store
  boundary for tests and benchmark execution, while adding direct
  `.memory`-backed SQLite tests for persistence behavior and operational tools.
- **Rationale**: Production uses durable data; tests can verify both parity with
  the SQL adapter and existing deterministic benchmark behavior without
  external services or contamination.
- **Alternatives considered**: Remove all mock-based tests and force benchmark
  tests through a shared persistent file (less isolated); leave production
  tools on the mock (does not deliver durable operations).
- **Repository note**: A source search found `IncidentServiceStore`, a
  three-operation interface in `src/services/incident-service.ts`, but no
  interface named `OpsStore`. The implementation should extract/expand the
  current store boundary to the complete operations contract rather than
  assume the requested interface already exists.
- **Composition note**: Tool factories currently create stores internally;
  ReAct and plan-and-execute each invoke those tools. Both strategy factories
  must accept the same injected store for production composition, while bench
  runs continue to receive an in-memory implementation.
- **Benchmark note**: `src/bench.ts` currently reads and cleans Sequelize
  records directly. It must move to the in-memory mock boundary to meet the
  no-persistent-side-effect requirement.

### Operational tool contract

- **Decision**: Keep existing tool names and behavior, adding
  `List_incidentes(status = "open")` and `consultar_runbook(service)`. Define
  descriptions around purpose, when-to-use guidance, every input field,
  permitted values/defaults, and whether state changes.
- **Rationale**: This preserves existing agent integrations while adding the
  explicitly requested operations and making mutation intent unambiguous.
- **Alternatives considered**: Rename the existing tools (unnecessary
  compatibility break); omit descriptions from individual fields (leaves
  model callers without the same input constraints).
