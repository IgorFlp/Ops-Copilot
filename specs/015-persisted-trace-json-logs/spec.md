# Feature Specification: Persisted Trace and JSON Logs

**Feature Branch**: `015-persisted-trace-json-logs`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Trace persistido + logs JSON
- /chat: requestID no corpor e no header X-Request-Id
- SQLite: request (metricas) e trace_events (node,payload)
- src/obs/logger.ts: 1 linha JSON por evento, só metadados
- GET /requests/:id registro + trace ordenado"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correlate each chat request by an identifier (Priority: P1)

As an API client or operations user, I want every chat request to produce a stable request identifier that is returned both in the response body and in an `X-Request-Id` response header, so that I can reference the same request across clients, logs, and support conversations.

**Why this priority**: A stable identifier is the foundation for persistence, retrieval, and correlation; without it, the remaining observability work cannot be used reliably.

**Independent Test**: Submit a valid chat request and verify the response body contains a `requestId` and the response header `X-Request-Id` carries the same value.

**Acceptance Scenarios**:

1. **Given** a valid chat request, **When** the response is returned, **Then** the body contains a non-empty `requestId` and the `X-Request-Id` header contains the identical value.
2. **Given** two separate chat requests, **When** both complete, **Then** each response has a distinct `requestId` and matching header.
3. **Given** concurrent chat requests, **When** responses are returned, **Then** each response's body identifier matches its own header and no identifier is shared between requests.

---

### User Story 2 - Persist request metrics and ordered trace events (Priority: P1)

As an operations user, I want each completed or failed chat request to be recorded with its metrics and its trace events, so that I can review what happened after the fact without relying on transient console output.

**Why this priority**: Persistence is the core value of the feature; it enables debugging, auditing, and post-incident analysis.

**Independent Test**: Complete a chat request, then inspect the local operational data store and verify one request record exists with metrics and that each trace event is stored with its node, payload, and original order.

**Acceptance Scenarios**:

1. **Given** a chat request completes successfully, **When** it is persisted, **Then** exactly one request record exists containing its metrics and outcome.
2. **Given** a chat request produces multiple trace events, **When** they are persisted, **Then** each event stores its originating node and payload and preserves the original event order.
3. **Given** a chat request fails explicitly, **When** it is persisted, **Then** the request record reflects the failure and a failure indicator rather than a success outcome.
4. **Given** concurrent chat requests, **When** they are persisted, **Then** their records and trace events remain associated with the correct request identifier.

---

### User Story 3 - Emit one-line JSON operational logs with metadata only (Priority: P2)

As an operations engineer, I want every operational event to be emitted as a single JSON line containing metadata only, so that logs can be parsed by standard tooling without leaking conversation content.

**Why this priority**: Machine-readable logs improve troubleshooting and alerting, while metadata-only content protects sensitive user data.

**Independent Test**: Trigger chat and failure paths, capture the emitted log lines, and verify each line is valid JSON, contains event and correlation metadata, and contains no message content, answer content, prompts, or secrets.

**Acceptance Scenarios**:

1. **Given** any operational event is emitted, **When** the log line is captured, **Then** it is a single line of valid JSON.
2. **Given** an event associated with a chat request, **When** its log line is emitted, **Then** the line includes the request identifier and event name.
3. **Given** a successful or failed chat request, **When** logs are emitted, **Then** no user message content, answer content, prompt text, tool arguments, or secret values appear in the log lines.
4. **Given** multiple events occur during one request, **When** they are logged, **Then** each event produces exactly one line and the lines remain attributable to that request.

---

### User Story 4 - Retrieve a request record with its ordered trace (Priority: P2)

As an operations user, I want to retrieve a request by its identifier, together with its trace in chronological order, so that I can reconstruct the path taken by that request.

**Why this priority**: Retrieval turns persisted data into usable diagnostics and completes the observability loop.

**Independent Test**: Persist a request with several trace events, request it by identifier, and verify the response contains the request record and all trace events in original order.

**Acceptance Scenarios**:

1. **Given** a persisted request identifier, **When** it is retrieved, **Then** the response contains the request record and its ordered trace.
2. **Given** a request whose trace has several events, **When** it is retrieved, **Then** the events appear in the same order in which they were produced.
3. **Given** an unknown request identifier, **When** it is retrieved, **Then** the caller receives an explicit not-found outcome.
4. **Given** a persisted failed request, **When** it is retrieved, **Then** the record reflects the failure and its stored trace is still available.

---

### Edge Cases

- If persistence of a completed request fails, the failure MUST be explicit; the request MUST NOT be reported as fully persisted while data is missing.
- If the same request identifier is submitted twice, the system MUST NOT overwrite or interleave the first request's trace; duplicate identifiers are handled explicitly rather than silently merged.
- If a request is still in progress, retrieval by its identifier MUST NOT return a partial record presented as complete.
- If a chat request fails validation before any trace is produced, no request record is required; validation errors remain request-level errors.
- If trace events are numerous, retrieval MUST return all of them in order without truncation.
- If log emission fails, the request outcome MUST still follow the explicit failure rules; logs are not used as the source of truth for persistence.
- If request content contains characters that could break line-based logs, each event MUST still occupy exactly one JSON line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every accepted chat request MUST be assigned a non-empty, unique request identifier.
- **FR-002**: The chat response body MUST include the request identifier, and the chat response MUST include an `X-Request-Id` header with the identical value.
- **FR-003**: The system MUST persist one request record per accepted chat request, containing its identifier, outcome, and request-level metrics.
- **FR-004**: The request record MUST distinguish successful completion from explicit failure.
- **FR-005**: The system MUST persist each trace event produced for a request, including the originating node and the event payload.
- **FR-006**: Persisted trace events MUST be retrievable in their original production order.
- **FR-007**: Operational logging MUST emit exactly one line of valid JSON per event.
- **FR-008**: Each operational log line MUST include the event name and, when the event belongs to a chat request, the request identifier.
- **FR-009**: Operational logs MUST contain metadata only and MUST NOT include user message content, answer content, prompt text, tool arguments, or secrets.
- **FR-010**: The system MUST expose retrieval of a request by identifier that returns the request record together with its ordered trace.
- **FR-011**: Retrieval of an unknown request identifier MUST return an explicit not-found outcome.
- **FR-012**: Persistence and logging MUST remain correctly correlated under concurrent requests; identifiers and trace events MUST NOT be mixed between requests.
- **FR-013**: A persistence failure MUST be surfaced explicitly and MUST NOT be presented as a successful or fully recorded request.
- **FR-014**: Request identifiers returned to clients MUST remain stable between the response body, the response header, the persisted record, and the emitted logs.
- **FR-015**: Automated tests MUST cover identifier echoing, persistence of request metrics and ordered trace events, metadata-only JSON log lines, retrieval of known and unknown identifiers, and concurrent request correlation.

### Key Entities *(include if feature involves data)*

- **Request Record**: A persisted representation of one chat request, including its identifier, outcome, request-level metrics, and timing. It is the parent of that request's trace events.
- **Trace Entry**: A persisted event belonging to one request, including its sequence position, originating node, event type, and payload.
- **Operational Log Line**: A single machine-readable record describing an event, carrying correlation metadata and no sensitive content.
- **Request Identifier**: A stable unique value that ties a response, persisted record, trace entries, and log lines together.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of successful chat responses include a request identifier in both the response body and the `X-Request-Id` header, with identical values.
- **SC-002**: 100% of accepted chat requests produce a retrievable request record with metrics.
- **SC-003**: 100% of persisted traces are returned in original production order on retrieval.
- **SC-004**: 100% of emitted operational log lines parse as valid JSON and contain zero user message content, answer content, prompt text, tool arguments, or secrets.
- **SC-005**: Retrieval of an unknown identifier returns an explicit not-found outcome within 1 second.
- **SC-006**: Under at least 20 concurrent chat requests, 100% of responses, records, traces, and log lines remain correctly correlated to their own identifier.
- **SC-007**: Operations users can reconstruct the sequence of nodes and events for any retained request using only its identifier.

## Assumptions

- The request identifier is generated by the system per accepted chat request, using a globally unique value; clients are not required to supply one.
- The identifier is added to the existing chat response without removing or renaming existing response fields.
- Persistence uses the project's existing local operational data store, with a request record and trace-event storage units as described in the input.
- Operational logs are written to the process's existing log destination as one JSON object per line.
- "Metadata only" excludes message text, answers, prompts, tool arguments, memory facts, and credentials; it includes identifiers, counts, durations, strategy names, node names, event types, statuses, and error codes.
- Trace events already carry node attribution from the unified production flow; this feature persists that attribution rather than redefining it.
- Retrieval returns data only for requests that have completed or failed; in-progress requests are not exposed as partial records.
- Retention, rotation, and deletion policies for persisted requests and logs are out of scope for this feature.
- Request identifiers are treated as opaque; clients retrieve by exact identifier.
