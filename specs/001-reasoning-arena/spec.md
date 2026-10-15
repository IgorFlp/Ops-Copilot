# Feature Specification: OpsPilot Reasoning Arena

**Feature Branch**: Not assigned

**Created**: 2026-10-15

**Status**: Draft

**Input**: Build a shared reasoning result contract and model setup; incident and alert tools with seeded operational data; ReAct and plan-and-execute strategies; an HTTP arena to run strategies against the same input and return traces and metrics; iteration and LLM-call limits; deterministic offline tests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect and manage operational records (Priority: P1)

As an operations engineer, I need to inspect alerts and create or resolve incidents so that I can take consistent actions against the current operational data.

**Why this priority**: The reasoning strategies need reliable operational facts and actions; this story also provides standalone operational value.

**Independent Test**: Seed the sample data, list alerts by status, create an incident for a known service, and resolve it by its identifier. Verify the resulting records persist and invalid actions produce explicit errors.

**Acceptance Scenarios**:

1. **Given** the sample data has been seeded, **When** the operator requests firing alerts, **Then** the three firing alerts are returned without resolved alerts.
2. **Given** a known service, **When** the operator opens an incident with a title and severity, **Then** a persisted incident is returned with an identifier and an open status.
3. **Given** an open incident identifier, **When** the operator resolves that incident, **Then** its status becomes resolved and remains resolved on a subsequent read.
4. **Given** an unknown service or incident identifier, **When** the operator attempts an action, **Then** the operation fails explicitly and does not report success.

### User Story 2 - Investigate an operational question (Priority: P1)

As an operations engineer, I need a reasoning strategy to investigate an operational question and show how it reached its answer so that I can evaluate and act on the result.

**Why this priority**: A useful answer must be grounded in available alerts and actions, and its trace must make the outcome reviewable.

**Independent Test**: Run the ReAct strategy with a deterministic model/tool fixture and verify its final answer, ordered trace events, action arguments, LLM-call count, and elapsed time without making a network request.

**Acceptance Scenarios**:

1. **Given** an operational question and available tools, **When** the ReAct strategy runs, **Then** it returns an answer, the ordered events produced during the run, and call-count and latency metrics.
2. **Given** a strategy emits an action, **When** its trace is inspected, **Then** the event identifies the tool or tools and their arguments, and the following tool result is represented as an observation.
3. **Given** the model configuration is missing or a model/tool operation fails, **When** the strategy runs, **Then** the error is surfaced and no fabricated answer is reported as successful.

### User Story 3 - Compare bounded reasoning strategies (Priority: P2)

As an operations engineer, I need to submit one HTTP request to run one or more strategies against the same question and inspect their separate results so that I can compare their approach and cost.

**Why this priority**: Comparison makes reasoning behavior and resource use visible while allowing a single strategy to be run independently.

**Independent Test**: Submit HTTP requests for each strategy individually and both strategies with the same input; verify a separate answer, trace, and metrics record for each selected strategy, and verify both iteration and step bounds.

**Acceptance Scenarios**:

1. **Given** a valid request selecting one or more strategies and an input, **When** the operator submits it to the arena, **Then** each selected strategy receives the same input and its trace and metrics are returned separately.
2. **Given** the plan-and-execute strategy, **When** it processes a question, **Then** it creates a structured plan, executes one step at a time, and revises the remaining steps after each execution until none remain or a configured limit is reached.
3. **Given** a run reaches its iteration limit or the plan reaches eight steps, **When** the limit is reached, **Then** the strategy stops and returns the work completed so far with accurate metrics.
4. **Given** an invalid request, unknown strategy name, or invalid iteration limit, **When** the arena receives it, **Then** it returns an explicit client error without starting an invalid run.

### User Story 4 - Reproduce sample data and verify output offline (Priority: P3)

As a developer or evaluator, I need repeatable sample operational records and deterministic tests so that I can demonstrate and verify tool and trace behavior without relying on a live model service.

**Why this priority**: A known dataset and offline checks make development and review reproducible.

**Independent Test**: Run the seed process twice against the configured development database and verify that it leaves five services and six varied alerts (three firing and three resolved), without creating duplicates; run store and trace-formatting tests with network access disabled.

**Acceptance Scenarios**:

1. **Given** the development database is available, **When** the seed process runs, **Then** it creates or updates five services and six varied alerts, split evenly between firing and resolved.
2. **Given** the seed data already exists, **When** the seed process runs again, **Then** it remains repeatable and does not duplicate the fixture records or delete unrelated records.
3. **Given** the store and trace-formatting tests run without network access, **When** they complete, **Then** their results are deterministic for the same fixtures.

### Edge Cases

- The model key or model name is absent, invalid, or rejected by the provider.
- The database is unavailable or a requested record does not exist.
- A tool receives malformed arguments, an unknown service, or an unsupported severity.
- No alerts match the requested status, or there are no open incidents to resolve.
- A model response cannot be interpreted as a valid plan or contains no remaining steps.
- A strategy reaches its iteration limit while a plan still has work, or the plan would exceed eight steps.
- A repeated attempt to resolve an already resolved incident must not silently alter its state.
- The arena receives a request with no strategies, an unknown strategy, a non-positive iteration limit, or missing/empty input.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every reasoning strategy MUST return a final answer, an ordered trace, and metrics containing the total LLM-call count and elapsed latency in milliseconds.
- **FR-002**: Trace events MUST use the event types `thought`, `action`, `observation`, `plan`, `critique`, and `answer`. An action event MUST identify its tool or tools and arguments. Thought events MUST be concise, user-facing reasoning summaries rather than private model deliberation.
- **FR-003**: Model credentials and model selection MUST be supplied through runtime configuration, generation MUST use deterministic settings, and missing or rejected configuration MUST produce an explicit error.
- **FR-004**: Services, alerts, and incidents MUST persist in the configured project datastore, which is the source of truth for operational tool actions.
- **FR-005**: The alert-list operation MUST accept a status filter and return matching alerts, including the firing and resolved statuses.
- **FR-006**: The incident-opening operation MUST accept a non-empty title, an existing service, and a supported severity; it MUST validate arguments before changing data and return the created incident identifier.
- **FR-007**: The incident-resolution operation MUST accept an existing open incident identifier, persist the resolved state, and explicitly reject unknown or already resolved incidents.
- **FR-008**: The seed process MUST produce five services and six varied alerts, with exactly three firing and three resolved alerts. Re-running it MUST not duplicate its fixtures or delete unrelated records. The development setup MUST run the seed so the initial sample data is available.
- **FR-009**: The ReAct strategy MUST use the prebuilt ReAct agent with the operational tools and capture the complete sequence of externally observable reasoning, plan, tool action, observation, critique, and answer events.
- **FR-010**: The plan-and-execute strategy MUST create a structured list of steps, execute at most one step before replanning, and revise the remaining plan after each step. It MUST stop when no steps remain, its iteration limit is reached, or eight steps have been considered.
- **FR-011**: Every strategy MUST enforce its configured iteration limit and count every LLM invocation it makes, including planning and replanning calls.
- **FR-012**: The arena MUST expose an HTTP operation that accepts one shared input, an optional selection of one or more strategies, and an optional iteration limit from 1 through 100; it MUST return a separate answer, trace, and metrics for every selected strategy. If strategies are omitted, it MUST run both available strategies. The default iteration limit MUST be eight. Invalid requests MUST receive an explicit client error.
- **FR-013**: Tests for the operational store and trace formatting MUST be deterministic and MUST NOT require network access.
- **FR-014**: A failed model, database, or tool operation MUST be surfaced as a failure and MUST NOT be represented as a successful answer or state change.

### Key Entities *(include if feature involves data)*

- **Service**: An operational service that alerts and incidents can reference.
- **Alert**: An operational signal associated with a service and a firing or resolved status, with enough descriptive detail to distinguish the seeded examples.
- **Incident**: A record opened for a service with a title, severity, identifier, and open or resolved status.
- **Reasoning result**: A strategy's answer, ordered trace events, and call-count and latency metrics for an input.
- **Trace event**: A typed record of a reasoning summary, plan, tool action, observation, critique, or answer; action records include tool names and arguments.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every successful strategy run produces one final answer, an ordered trace containing only the six defined event types, and both required metrics.
- **SC-002**: In seeded-data verification, 100% of seed runs create exactly five designated service fixtures and six designated alert fixtures, including three firing and three resolved; reruns leave those fixture counts unchanged without affecting unrelated records.
- **SC-003**: In all limit tests, no strategy exceeds its configured iteration maximum and plan-and-execute never considers more than eight steps.
- **SC-004**: In arena comparison tests, every selected strategy receives the identical input and has its own answer, trace, LLM-call count, and latency measurement in the HTTP response.
- **SC-005**: All store and trace-formatting test cases pass deterministically with network access disabled.
- **SC-006**: Operators can identify the tools and arguments used, the observations returned, and the final answer from the printed trace without reconstructing the run from external logs.

## Assumptions

- Operators submit the question and optional strategy selection in a single HTTP request; if strategy selection is omitted, both available strategies run.
- The default maximum iteration count is eight; callers may choose a lower positive limit.
- The HTTP arena accepts iteration limits from 1 through 100 to bound request resource usage.
- The eight-step ceiling applies to the plan-and-execute strategy independently of a caller-supplied iteration limit.
- Supported incident severities are `critical`, `high`, `medium`, and `low`.
- The seed is scoped to its own known fixtures and is repeatable without deleting unrelated operational data.
- Model credentials and model selection are provided by the runtime environment; no secret is stored in the repository.
- The configured project datastore is the persistent source of truth for operational records, as clarified by the user. An available development database is required to run the seed.
- Model-provider calls are not part of deterministic store and trace-formatting tests.
