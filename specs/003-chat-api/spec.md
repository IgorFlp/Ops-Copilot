# Feature Specification: Chat API

**Feature Branch**: `[unbranched]`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express), body:{ message, strategy?,reflect?} validado com zod, default react, 200: {answer,trace,metrics}, 400: body invalido (issues do zod), 422: estratégia desconhecida, timeout 180s -> 504 Registry em src/agent/index.ts (nome-> estrategia, reflect aplica withReflection). teste de integração com estrategia fake deterministica sem rede"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a chat request with defaults (Priority: P1)

An operator sends a message to the chat endpoint and receives an answer with
its execution trace and usage metrics, without having to specify a strategy.

**Why this priority**: This is the primary way to use the chat capability and
provides the simplest usable request contract.

**Independent Test**: Submit a valid message without optional fields using a
deterministic strategy fixture. Verify that the default strategy is selected
and the response contains the answer, trace, and metrics.

**Acceptance Scenarios**:

1. **Given** a valid message and no optional fields, **When** the client submits
   a chat request, **Then** the system runs the default `react` strategy and
   returns status 200 with `answer`, `trace`, and `metrics`.
2. **Given** a valid message and a supported strategy name, **When** the client
   submits a chat request, **Then** the requested strategy produces the result
   returned in the same response shape.

### User Story 2 - Request a reflected answer (Priority: P2)

An operator opts into reflection when they want an answer reviewed and improved
before it is returned.

**Why this priority**: Reflection adds value for requests that need a checked
answer while keeping ordinary requests on the current default behavior.

**Independent Test**: Submit a valid request with reflection enabled and use
deterministic strategy and critic fixtures. Verify reflection is applied and
the final answer, trace, and metrics are returned without network access.

**Acceptance Scenarios**:

1. **Given** a valid request with `reflect` set to true, **When** processing
   completes, **Then** the selected strategy is run with reflection and the
   response includes the resulting answer, trace, and metrics.
2. **Given** a valid request with `reflect` omitted or false, **When** processing
   completes, **Then** reflection is not applied.

### User Story 3 - Receive clear errors for invalid requests (Priority: P1)

An operator or client receives a distinct, machine-readable error when the
request is malformed, uses an unsupported strategy, or exceeds the allowed
processing time.

**Why this priority**: Clear error categories let clients correct invalid input
and distinguish it from unsupported capabilities or long-running requests.

**Independent Test**: Exercise malformed bodies, unknown strategy names, and a
deterministic strategy that exceeds the time limit; verify their HTTP status
codes and error response details.

**Acceptance Scenarios**:

1. **Given** a missing, empty, or incorrectly typed message, or an incorrectly
   typed optional field, **When** the request is submitted, **Then** the system
   returns status 400 with the input-validation issues.
2. **Given** a structurally valid request naming an unsupported strategy,
   **When** the request is submitted, **Then** the system returns status 422
   and identifies the unsupported strategy.
3. **Given** a request that has not completed within 180 seconds, **When** the
   processing deadline is reached, **Then** the system returns status 504
   instead of a success response.

### Edge Cases

- A body that is absent, not an object, or contains fields of the wrong type is
  rejected with status 400 and validation issues.
- An empty or whitespace-only message is invalid.
- Unknown fields are rejected rather than silently interpreted.
- An unsupported strategy is reported as 422 only after the request shape has
  passed validation; malformed requests remain 400.
- A request completing at or before the 180-second deadline can return its
  normal result; one exceeding the deadline returns 504.
- Strategy, reflection, or other execution failures must not be reported as a
  successful answer.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept chat requests through `POST /chat`.
- **FR-002**: A request MUST contain a non-empty `message`. It MAY contain a
  `strategy` name and a boolean `reflect` option. Other request fields MUST be
  rejected.
- **FR-003**: When `strategy` is omitted, the system MUST select `react`.
- **FR-004**: The system MUST select a strategy by its registered name and MUST
  support the existing `react` and `plan-and-execute` strategies.
- **FR-005**: The system MUST apply reflection to the selected strategy only
  when `reflect` is true. When omitted, `reflect` MUST default to false.
- **FR-006**: A successful request MUST return status 200 with an object
  containing `answer`, `trace`, and `metrics` from the selected execution.
- **FR-007**: An invalid request body MUST return status 400 and include
  structured input-validation issues that identify the invalid fields.
- **FR-008**: A structurally valid request with an unknown strategy name MUST
  return status 422 and identify the unsupported strategy.
- **FR-009**: A request that exceeds 180 seconds of processing MUST return
  status 504.
- **FR-010**: Integration tests MUST exercise the endpoint using deterministic
  fake strategies and reflection dependencies, without making network calls.
- **FR-011**: Failures during strategy execution or reflection MUST be surfaced
  as errors and MUST NOT produce a success-shaped response.

### Key Entities

- **Chat Request**: A message and optional strategy name and reflection choice.
- **Strategy**: A named reasoning operation selected for a chat request.
- **Chat Result**: The answer, ordered trace, and metrics produced by a strategy.
- **Validation Issue**: A structured description of an invalid request field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid requests that omit a strategy select `react` and
  return all three required result fields.
- **SC-002**: 100% of malformed request cases return status 400 with at least
  one structured validation issue; valid requests with unknown strategies
  return 422.
- **SC-003**: 100% of deterministic integration test cases complete without
  network access and verify the returned answer, trace, and metrics.
- **SC-004**: Requests that exceed 180 seconds return status 504 rather than
  status 200.

## Assumptions

- The supported strategy names are the existing `react` and
  `plan-and-execute` strategies; future registered names can be selected
  without changing the request shape.
- `reflect` is opt-in and defaults to false to preserve the behavior and cost
  of ordinary requests.
- Validation failures take precedence over strategy lookup failures.
- Error response formats beyond the explicitly required validation issues use
  the project's established error-response convention.
- Deterministic test doubles replace strategy and reflection model dependencies
  so endpoint integration tests do not require a live model provider or other
  network service.
