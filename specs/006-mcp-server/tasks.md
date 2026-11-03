# Tasks: OpsPilot MCP Server

**Input**: Design documents from `specs/006-mcp-server/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/mcp-tools.md`, and `quickstart.md`

**Tests**: Required by FR-011 and the project constitution. Use `node:test`
through `tsx`, in-memory stores, and local MCP transports; do not contact
external services or mutate the default persistent database.

**Organization**: Tasks are grouped by the three independently specified user
stories. All stories are P1, with implementation ordering reflecting their
shared MCP server entry point.

## Phase 1: Setup

**Purpose**: Add the MCP SDK dependency and requested run command.

- [X] T001 Add `@modelcontextprotocol/sdk` stable v1 dependency and the `mcp` script with the exact command `tsx src/mcp/server.ts` in `package.json` and update `package-lock.json`.

---

## Phase 2: Foundational

**Purpose**: Establish one reusable source for the three operational input
schemas before either interface consumes them.

- [X] T002 Extract the alert-list, incident-list, and incident-resolution Zod objects into exported schemas in `src/agents/tool-schemas.ts`, then update `src/agents/tools.ts` to import and use those exports without changing existing LangChain tool behavior.

**Checkpoint**: MCP and LangChain adapters can now share the same Zod
definitions; story implementation can begin.

---

## Phase 3: User Story 1 - Inspect alerts and incidents from an MCP client (Priority: P1)

**Goal**: Discover and call read-only alert and incident listing tools with
existing defaults and filters.

**Independent Test**: Connect an in-memory MCP client/server pair, discover
`list_alerts`, `open_incidents`, and `resolve_incident`, then call the two
listing tools with omitted and explicit status values. Verify results against
the same injected store and confirm listings do not change state.

### Tests for User Story 1

- [X] T003 [US1] Add MCP client/server integration tests for server initialization, discovery of the three exact tool names, and default plus `firing`, `resolved`, `all`, `open` status results using an in-memory store in `src/mcp/server.test.ts`.

### Implementation for User Story 1

- [X] T004 [US1] Implement an injectable MCP server factory and register `list_alerts` and `open_incidents` using the shared schemas and `createIncidentService` in `src/mcp/server.ts`; return serialized existing records and keep both handlers read-only.

**Checkpoint**: The MCP client can discover the requested interface and
independently validate alert and incident listing against isolated operational
data.

---

## Phase 4: User Story 2 - Resolve an incident through an MCP client (Priority: P1)

**Goal**: Resolve an eligible incident through MCP and make the result visible
through the same injected operational store.

**Independent Test**: Create an open incident in an in-memory store, resolve
its positive identifier through the MCP client, then list resolved incidents.
Verify that invalid, unknown, and already-resolved identifiers return failed
MCP tool results rather than success-shaped records.

### Tests for User Story 2

- [X] T005 [US2] Add tests for successful `resolve_incident`, shared-state visibility after resolution, and explicit MCP errors for invalid, unknown, and already-resolved incident IDs in `src/mcp/server.test.ts`.

### Implementation for User Story 2

- [X] T006 [US2] Register `resolve_incident` with the shared resolution schema and existing incident service in `src/mcp/server.ts`; serialize successful results and translate failures into concise MCP `isError: true` results without exposing internal details.

**Checkpoint**: Incident resolution is available over MCP and can be verified
against the same data source used by other OpsPilot interfaces.

---

## Phase 5: User Story 3 - Connect reliably using the standard input/output protocol (Priority: P1)

**Goal**: Start the named OpsPilot server through the npm command and keep
protocol output parseable while the process handles startup, requests, errors,
and shutdown.

**Independent Test**: Spawn `npm run mcp` as an MCP stdio child process,
initialize it, discover all three tools, and inspect captured output. Verify
stdout consists only of MCP protocol messages, no `console.log` is called, and
any diagnostics use stderr.

### Tests for User Story 3

- [X] T007 [US3] Add a child-process stdio test that launches `npm run --silent mcp`, initializes an MCP client, verifies server identity `opspilot` and exact tool discovery, checks stdout contains only protocol responses, and terminates the child in `src/mcp/server.test.ts`.

### Implementation for User Story 3

- [X] T008 [US3] Add the stdio process entry point in `src/mcp/server.ts` using `StdioServerTransport`, name the server `opspilot`, connect the shared default store/service, route diagnostics only to stderr without calling `console.log`, and close the default store during orderly shutdown.

**Checkpoint**: A spawned client can use the stdio protocol while all reads and
mutations operate on the shared store without corrupting stdout.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature, existing tool compatibility, and
the operator-facing run guide.

- [X] T009 [P] Update `specs/006-mcp-server/quickstart.md` with the final automated test and stdio smoke-test commands and expected outcomes after implementation.
- [X] T010 Run `npm run typecheck` and `npm test`; resolve any regressions in `src/agents/tool-schemas.ts`, `src/agents/tools.ts`, `src/mcp/server.ts`, `src/mcp/server.test.ts`, `package.json`, and `package-lock.json`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; installs the SDK and defines the start
  command.
- **Foundational (Phase 2)**: Depends on Setup; shared schemas block all MCP
  tool registration.
- **User Story 1 (Phase 3)**: Depends on the shared schemas in Phase 2.
- **User Story 2 (Phase 4)**: Depends on User Story 1's injectable MCP server
  factory; extends the same server module and test suite.
- **User Story 3 (Phase 5)**: Depends on the registered tools from User Stories
  1 and 2; adds the stdio process lifecycle to their server module.
- **Polish (Phase 6)**: Depends on all three user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Setup and Foundational; no dependency on
  another story.
- **User Story 2 (P1)**: Starts after User Story 1 because it extends the
  injectable server factory in `src/mcp/server.ts`.
- **User Story 3 (P1)**: Starts after User Stories 1 and 2 because its spawned
  process test verifies the complete tool set and its entry point lives in
  `src/mcp/server.ts`.

### Parallel Opportunities

- T003 (US1) can be written in parallel with T004 (US1) after Phase 2 because
  the test and server implementation are separate files. Run it once T004 is
  ready.
- T005 (US2) can be authored independently of T006 (US2), then validated after
  implementation; both tasks intentionally touch the same test/implementation
  files only on their respective sides.
- T009 documentation updates can run in parallel with final validation once
  the implementation behavior is stable.
- User story implementation phases are sequential because they extend one
  shared server entry point and integration-test file; there is no safe
  independent parallel implementation across the three stories.

---

## Parallel Example: User Story 1

```text
After T002, implement T003 in src/mcp/server.test.ts while implementing T004
in src/mcp/server.ts. Run the tests after both changes are available.
```

## Parallel Example: User Story 2

```text
Write T005 in src/mcp/server.test.ts independently from T006 in
src/mcp/server.ts. Run the new test after T006 is complete.
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001-T002 to install the SDK, define the run command, and extract
   shared schemas.
2. Complete T003-T004 to deliver discoverable read-only alert and incident
   listing tools on an injectable server.
3. **Stop and validate** User Story 1 with the in-memory MCP test client before
   proceeding.

### Incremental Delivery

1. Add User Story 2 and verify resolve success, error handling, and shared
   state.
2. Add User Story 3 and verify the actual stdio process boundary and stream
   discipline.
3. Update the quickstart and run typecheck plus the full test suite.

---

## Notes

- Every task uses the required checkbox, sequential ID, optional parallel
  marker, required user-story label within story phases, and concrete file
  paths.
- MCP output must never be replaced with diagnostics; tool failures must not
  look successful.
- The default persistent store must not be modified by automated tests.
