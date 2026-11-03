# Feature Specification: OpsPilot MCP Server

**Feature Branch**: Not assigned

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "MCP server do OpsPilot com transporte stdio, disponibilizando `list_alerts`, `open_incidents` e `resolve_incident`, compartilhando o mesmo OpsStore e os schemas Zod das tools existentes, identificado como `opspilot`, com comando `npm run mcp`. O stdout fica reservado ao protocolo; diagnósticos devem ir para stderr." The requested package name was clarified as `@modelcontextprotocol/sdk` (the original description said `@modelcontextprotocol/sdl`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect alerts and incidents from an MCP client (Priority: P1)

During an operational investigation, an operator uses an MCP client to inspect
current alerts and tracked incidents without switching to a separate data
source. The operator can narrow each list using the status options already
available in OpsPilot.

**Why this priority**: Shared, current operational observations are the
foundation for making incident decisions.

**Independent Test**: Connect an MCP client to the server, request alerts and
incidents using their defaults, then repeat with each supported status filter.
Verify that each result matches the corresponding operation against the same
operational data.

**Acceptance Scenarios**:

1. **Given** alerts with firing and resolved states exist, **When** the
   operator calls `list_alerts` without a status, **Then** only firing alerts
   are returned.
2. **Given** alerts exist in multiple states, **When** the operator calls
   `list_alerts` with `firing`, `resolved`, or `all`, **Then** the returned
   alerts match the selected status.
3. **Given** open and resolved incidents exist, **When** the operator calls
   `open_incidents` without a status, **Then** only open incidents are returned.
4. **Given** incidents exist in multiple states, **When** the operator calls
   `open_incidents` with `open`, `resolved`, or `all`, **Then** the returned
   incidents match the selected status and no incident state is changed.

### User Story 2 - Resolve an incident through an MCP client (Priority: P1)

When an operator explicitly requests closure of an existing open incident, the
operator can resolve it from the MCP client and receive confirmation of its
updated state.

**Why this priority**: The incident lifecycle must remain actionable and
consistent regardless of which supported interface an operator uses.

**Independent Test**: Resolve an open incident using its identifier, then list
incidents and verify it is resolved in the same operational data. Also try an
invalid, missing, or already-resolved incident and verify that the operation
fails explicitly.

**Acceptance Scenarios**:

1. **Given** an open incident exists, **When** the operator calls
   `resolve_incident` with its positive identifier, **Then** the incident is
   resolved and the result reflects the persisted state.
2. **Given** an identifier is invalid, unknown, or already resolved, **When**
   the operator calls `resolve_incident`, **Then** the client receives an
   explicit failure and no successful resolution is reported.
3. **Given** an operator only wants to inspect operational data, **When** the
   operator uses either listing tool, **Then** no data is changed.

### User Story 3 - Connect reliably using the standard input/output protocol (Priority: P1)

An operator starts OpsPilot's MCP server from the project command and connects
an MCP-compatible client over standard input and output. Protocol messages must
remain parseable even when the server reports diagnostics.

**Why this priority**: A reliable connection is required before any operational
tool can be used, and protocol corruption could prevent all operations.

**Independent Test**: Start the server using its documented npm command,
complete an MCP initialization and tool-list exchange over stdio, and verify
that stdout contains only valid protocol messages while diagnostics, if any,
are sent to stderr.

**Acceptance Scenarios**:

1. **Given** the server is started with the `mcp` npm script, **When** an MCP
   client initializes a stdio session, **Then** it identifies the server as
   `opspilot` and can discover the three requested tools.
2. **Given** the server starts, handles tool calls, or reports an operational
   problem, **When** the client reads protocol output, **Then** the server
   does not call `console.log`, stdout contains no non-protocol logging, and
   diagnostics are written to stderr.
3. **Given** the MCP server and another OpsPilot interface operate on the same
   configured store, **When** one interface changes or reads an incident,
   **Then** the other interface observes that same operational state.

### Edge Cases

- The operational store cannot be opened or an operation fails.
- A caller supplies a status value outside the existing supported values.
- A caller supplies a missing, invalid, unknown, or already-resolved incident
  identifier.
- The client disconnects or sends malformed protocol input.
- A startup or tool diagnostic occurs while the stdio protocol is active; it
  must not be written to stdout.
- An operational failure must not be represented as a successful tool result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an MCP server identified as `opspilot`
  using `@modelcontextprotocol/sdk` and communicating with clients over stdio.
- **FR-002**: The server MUST expose exactly the requested operational
  capabilities as `list_alerts`, `open_incidents`, and `resolve_incident`.
- **FR-003**: `list_alerts` MUST accept the existing alert status options
  `firing`, `resolved`, and `all`, default to `firing`, and return matching
  alerts without changing operational data.
- **FR-004**: `open_incidents` MUST list incidents, accept the existing
  incident status options `open`, `resolved`, and `all`, default to `open`,
  and remain read-only.
- **FR-005**: `resolve_incident` MUST accept the existing positive incident
  identifier input and resolve only an eligible open incident.
- **FR-006**: Each MCP tool MUST validate inputs using the same Zod schemas
  that define the corresponding existing OpsPilot tool inputs. A change to an
  input contract MUST NOT require maintaining a second independent schema.
- **FR-007**: MCP operations MUST read and mutate the same operational store
  and incident services as the existing application tools. They MUST NOT
  create a separate source of operational state.
- **FR-008**: The server MUST NOT call `console.log`. It MUST send protocol
  messages only to stdout and all diagnostics to stderr; application logging
  MUST NOT write to stdout.
- **FR-009**: The project MUST provide an `mcp` npm script that starts
  `tsx src/mcp/server.ts`. Environment-file loading MUST be added only if
  required for the server to initialize the existing store.
- **FR-010**: Invalid inputs, unavailable data, and domain failures MUST be
  reported explicitly to the MCP client and MUST NOT be returned as
  success-shaped operational results.
- **FR-011**: Automated checks MUST cover server initialization and tool
  discovery, all three tool operations, shared operational state, and the
  separation of protocol output from diagnostics without requiring an external
  operational service.

### Key Entities

- **MCP client session**: A client's stdio connection to the `opspilot` server
  for initialization, tool discovery, and tool calls.
- **Alert**: An existing operational alert with a status used to filter
  read-only results.
- **Incident**: An existing operational record with an identifier and status;
  it may be listed or explicitly resolved.
- **Operational store**: The existing source of alert and incident data shared
  by OpsPilot interfaces.
- **Tool input contract**: The validated input shape for an exposed operation,
  shared with the corresponding existing OpsPilot tool.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An MCP client can initialize a stdio session and discover all
  three requested tools in 100% of automated protocol checks.
- **SC-002**: For every supported status filter, MCP alert and incident
  results match results from the corresponding existing OpsPilot operation on
  the same store.
- **SC-003**: A successful resolution is visible through both the MCP server
  and the existing application interface; invalid or ineligible resolutions
  never report success.
- **SC-004**: All automated output checks confirm that the server does not
  call `console.log`, stdout contains only valid protocol messages, and
  diagnostics use stderr.
- **SC-005**: Every invalid-input, store-failure, and domain-failure scenario
  covered by automated checks returns an explicit failure rather than a
  success-shaped result.
- **SC-006**: Operators can inspect alerts, inspect incidents, and resolve an
  eligible incident from one MCP client session without maintaining or
  reconciling a separate operational data source.

## Assumptions

- `open_incidents` means listing incidents; it does not create incidents.
- The existing alert and incident status filters and their defaults define
  the MCP tools' input behavior.
- `resolve_incident` is an explicit state-changing operation; listing alerts
  and incidents is read-only.
- The intended dependency is `@modelcontextprotocol/sdk`, as confirmed after
  correcting the package spelling in the initial request.
- The requested npm script is `mcp` with the command `tsx src/mcp/server.ts`.
  The existing store has a default database location, so environment-file
  loading is not assumed to be required.
- Authentication and authorization remain governed by the process environment
  and existing OpsPilot operational policies; this feature does not introduce
  a separate access-control model.
