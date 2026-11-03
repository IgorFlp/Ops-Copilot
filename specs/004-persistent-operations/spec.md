# Feature Specification: Persistent Operations Store

**Feature Branch**: Not assigned

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Persist operational data in SQLite, use a repeatable five-service/six-alert Mercadinho seed and checkout/payments/auth runbooks, add incident listing and runbook consultation, clarify operational tool descriptions, and keep deterministic in-memory tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep operational records between runs (Priority: P1)

As an operations engineer, I need service, alert, incident, and runbook records
to remain available after the application restarts so that operational work is
not lost with a process or in-memory session.

**Why this priority**: Durable operational state is the foundation for reliable
incident handling and agent answers.

**Independent Test**: Start with an empty store, initialize the sample data,
create and resolve an incident, restart the application using the same store,
and verify that the records and final incident state are unchanged.

**Acceptance Scenarios**:

1. **Given** an empty operational store, **When** the application initializes
   the sample data, **Then** it contains five services, six alerts (three
   firing and three resolved), with the established severity distribution,
   and the requested checkout, payments, and auth runbooks.
2. **Given** the sample data has already been initialized, **When** it is
   initialized again, **Then** the same sample records remain available without
   duplicate fixtures or removal of unrelated operational records.
3. **Given** an incident has been opened and resolved, **When** the application
   restarts against the same store, **Then** the incident remains resolved and
   its resolution time remains available.
4. **Given** a service is stored, **When** its tier is read, **Then** it is one
   of `tier-1`, `tier-2`, or `tier-3`; unsupported tier values are rejected.

---

### User Story 2 - Review and manage incidents (Priority: P1)

As an operations engineer, I need to open incidents, find incidents by status,
and resolve open incidents so that I can track operational work from creation
through resolution.

**Why this priority**: Incident state is actionable operational information
that must remain consistent and auditable.

**Independent Test**: Open an incident for a known service, list open
incidents, resolve it, and verify it appears only in resolved/all results with
its resolution time recorded.

**Acceptance Scenarios**:

1. **Given** an open incident exists, **When** the operator lists incidents
   without choosing a status, **Then** open incidents are returned by default.
2. **Given** incidents with open and resolved states exist, **When** the
   operator requests `open`, `resolved`, or `all`, **Then** only matching
   incidents are returned, or all incidents are returned for `all`.
3. **Given** a valid service and incident details, **When** the operator opens
   an incident, **Then** it is stored with an identifier, open status, and
   optional summary.
4. **Given** an open incident, **When** the operator resolves it, **Then** its
   status changes to resolved and a resolution time is recorded.
5. **Given** an unknown service or incident, an already-resolved incident, or
   an unsupported closed value, **When** an operation is attempted, **Then** it
   fails explicitly and no false success is returned.

---

### User Story 3 - Consult service runbooks through the operations assistant (Priority: P2)

As an operations engineer, I need the assistant to retrieve relevant service
runbooks and use the existing alert and incident operations so that its
responses are grounded in the same operational records I can inspect.

**Why this priority**: Runbooks provide service-specific guidance, while
consistent tools let the assistant inspect and manage the durable state.

**Independent Test**: Ask the assistant to retrieve the runbook for checkout,
payments, and auth; verify the matching guidance is returned. Exercise the
existing alert and incident tools and verify they read and change the same
store.

**Acceptance Scenarios**:

1. **Given** a runbook exists for a service, **When** the operator asks to
   consult it using a service reference, **Then** the matching runbook is
   returned.
2. **Given** no runbook matches a service reference, **When** the operator
   requests runbook guidance, **Then** the assistant reports that no matching
   runbook is available rather than inventing instructions.
3. **Given** the assistant can list alerts, open incidents, resolve incidents,
   list incidents, and consult runbooks, **When** it presents these operations,
   **Then** each tool description explains its purpose and when to use it,
   describes every input field, states permitted enum values and defaults, and
   makes any state-changing effect clear.
4. **Given** the assistant opens an incident, **When** its tool guidance is
   reviewed, **Then** the circumstances for opening an incident are distinct
   from the guidance for merely inspecting alerts or runbooks.

---

### User Story 4 - Run deterministic checks without persistent side effects (Priority: P2)

As a developer or evaluator, I need to run tool and benchmark scenarios against
an isolated in-memory store so that tests are repeatable and do not alter
development operational data.

**Why this priority**: Isolated deterministic tests protect persisted data and
keep existing tool and benchmark behavior reproducible.

**Independent Test**: Run the existing tool tests and representative benchmark
scenarios with an in-memory store and no network access; verify the same
expected results on repeated runs and confirm the configured persistent store
is untouched.

**Acceptance Scenarios**:

1. **Given** an in-memory store is selected, **When** an existing operational
   tool test runs, **Then** it exercises the same alert and incident behaviors
   without reading or changing the persistent store.
2. **Given** a benchmark scenario is run repeatedly with the same fixtures,
   **When** its results are checked, **Then** its outputs and operational
   effects are reproducible and isolated to that run.
3. **Given** normal application composition starts, **When** operational
   services are used, **Then** they all read and write through the persistent
   operational store.

### Edge Cases

- The configured persistent store cannot be opened or initialized.
- The store is empty, partially initialized, or already contains fixture data.
- A seed is repeated after operator-created records already exist.
- An incident is resolved more than once, or its identifier does not exist.
- A service reference is unknown or ambiguous.
- A runbook is missing for the requested service.
- A closed domain value is outside its supported set.
- The in-memory test store is accidentally shared with the persistent store.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve services, alerts, incidents, and
  runbooks across application restarts when the same persistent store is used.
- **FR-002**: The operational store MUST represent five services, six seeded
  alerts (three firing and three resolved), and runbooks for checkout,
  payments, and auth. Seeded firing alerts MUST retain the current mock's
  severity distribution of two `critical` alerts and one `high` alert; seeded
  resolved alerts MUST have `medium` severity. Each service MUST have a tier
  selected from `tier-1`, `tier-2`, or `tier-3`.
- **FR-003**: Repeating sample-data initialization MUST NOT duplicate fixture
  records or delete unrelated operational records.
- **FR-004**: Alerts MUST retain the current domain's severity values:
  `critical`, `high`, `medium`, and `low`. Alert status MUST be either
  `firing` or `resolved`; incident status MUST be either `open` or `resolved`.
  Unsupported values MUST be rejected.
- **FR-005**: An incident MUST contain its current domain attributes and
  MUST additionally support nullable `summary` and `resolved_at` fields.
  An open incident has no resolution time; resolving it records the time of
  resolution.
- **FR-006**: The system MUST allow operators to open an incident only for an
  existing service, with a non-empty title and a supported severity. It MUST
  accept an optional nullable summary and return the new incident identifier,
  open state, summary, and null resolution time.
- **FR-007**: The system MUST allow operators to resolve an existing open
  incident. Unknown or already-resolved incidents MUST produce explicit
  failures and MUST NOT be reported as successfully resolved.
- **FR-008**: The `List_incidentes` operation MUST accept a `status` filter
  with `open`, `resolved`, or `all`; when no value is supplied, it MUST return
  open incidents.
- **FR-009**: The `consultar_runbook(service)` operation MUST accept a service
  reference and return the matching service guidance. A missing match MUST be
  reported explicitly.
- **FR-010**: The assistant MUST expose `list_alerts`, `open_incidente`,
  `resolve_incidente`, `List_incidentes`, and `consultar_runbook`, all backed
  by the same operational store.
- **FR-011**: Every operational tool description MUST state the tool's purpose
  and appropriate use, describe every input field, list valid closed values
  and defaults, and explain whether the operation changes state. The
  incident-opening description MUST distinguish when an incident should be
  opened from read-only inspection.
- **FR-012**: Normal application composition MUST use the persistent
  operational store. Tests and benchmark scenarios MUST remain able to use an
  isolated `.memory` store and reproduce their outcomes without network access.
- **FR-013**: Storage and tool errors MUST be surfaced explicitly; failed
  operations MUST NOT be represented as successful data changes.
- **FR-014**: The operator MUST be able to select the persistent data location
  through `OPSPILOT_DB`; when it is unset, the location MUST default to
  `./data/opspilot.db`.
- **FR-015**: Store initialization MUST be safe to repeat and MUST NOT remove
  existing operational records.
- **FR-016**: Local persistent data under `data/` MUST NOT be included in
  version-controlled project files.
- **FR-017**: The operational database MUST contain exactly four tables for
  services, alerts, incidents, and runbooks. Table creation MUST be
  idempotent. Every data query MUST use a prepared statement with bound
  values; user-provided values MUST NOT be concatenated into SQL.
- **FR-018**: The seeded services MUST be Payments, Checkout, Inventory,
  Catalog, and Auth. The six alerts MUST include three firing and three
  resolved fixtures; the firing fixtures MUST retain two critical and one
  high severity and the resolved fixtures MUST have medium severity.
- **FR-019**: Tests that select `.memory` MUST use an isolated in-memory
  database and MUST cover schema and seed initialization, opening, listing,
  resolving, status filters, and database checks. Existing operational tool
  tests MUST exercise `.memory`; benchmark scenarios MUST remain reproducible
  with the in-memory mock.

### Key Entities *(include if feature involves data)*

- **Service**: An operational service identified by a stable reference, with
  descriptive details and a tier of `tier-1`, `tier-2`, or `tier-3`.
- **Alert**: A service-associated operational signal with a title, description,
  supported severity, and firing or resolved status.
- **Incident**: A service-associated operational record with an identifier,
  title, supported severity, open or resolved status, nullable `summary`, and
  nullable `resolved_at`.
- **Runbook**: Service-specific operational guidance that can be retrieved by
  service reference.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a restart using the same persistent store, 100% of
  previously saved service, alert, incident, and runbook records remain
  available with unchanged state.
- **SC-002**: Repeated initialization leaves exactly five seeded services,
  six seeded alerts (three firing and three resolved), and one intended
  runbook for each of checkout, payments, and auth, with no duplicate fixtures.
- **SC-003**: Incident-listing tests return 100% of matching incidents for
  `open`, `resolved`, and `all`; omitting the filter returns only open
  incidents.
- **SC-004**: Every successful incident resolution has resolved status and a
  recorded resolution time; unknown or already-resolved incidents never
  produce a success result.
- **SC-005**: All existing operational tool tests and benchmark scenarios pass
  deterministically with network access disabled and do not alter the
  persistent store when run in memory.
- **SC-006**: Every exposed operational tool description identifies its
  purpose, when to use it, all input fields, closed values/defaults, and
  state-changing behavior.
- **SC-007**: Every stored service has one of the three allowed tier values;
  unsupported tier values and unsupported alert or incident enum values are
  rejected.
- **SC-008**: The configured data location is selected by `OPSPILOT_DB`, falls
  back to `./data/opspilot.db` when unset, and is excluded from version control.
- **SC-009**: The operational database contains exactly the four specified
  tables, initializes them idempotently, and rejects data operations whose
  values fail the closed-domain constraints.

## Assumptions

- The five-service and six-alert counts are fixed by the requested sample
  scenario. The repository has no Mercadinho fixture, so the chosen
  Mercadinho-specific service set replaces Orders with Auth while retaining
  Payments, Checkout, Inventory, and Catalog. The existing order alert fixture
  becomes an auth alert so the requested five-service and alert-count
  constraints remain satisfied.
- The requested service tier is represented by the conventional closed set
  `tier-1`, `tier-2`, and `tier-3`; the current source domain has no tier field.
- A repeated seed is safe and idempotent: it does not duplicate its fixtures
  or delete unrelated records.
- Runbooks are retrievable guidance associated with a service; exact
  runbook prose is implementation content and may follow the project's
  operational examples.
- Existing production tool behavior remains compatible except for the
  explicitly requested incident listing and runbook consultation capabilities.
- Tests and benchmarks use isolated in-memory operational state; normal
  application use persists state between runs.
- The requested persistent data location is selected through `OPSPILOT_DB`
  and defaults to `./data/opspilot.db`; `.memory` selects isolated in-memory
  state for tests and benchmarks.
