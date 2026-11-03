# Quickstart: OpsPilot MCP Server Validation

## Prerequisites

- Node.js 22.13 or later and npm dependencies installed.
- A local test setup that can inject an in-memory `OpsStore`.
- For the process-level smoke test, an MCP client or the SDK client transport
  used by the automated integration test.

## Automated validation

From the repository root:

1. Run `npm run typecheck`.
   - **Expected**: TypeScript completes without errors.
2. Run `npm test`.
   - **Expected**: Existing tests and MCP tests pass without contacting an
     external monitoring service or modifying the default persistent database.
3. Ensure the MCP tests cover:
   - Initialization reports server name `opspilot` and tool discovery returns
     exactly the requested tool names.
   - Alert and incident filters/defaults match the shared schemas and service
     behavior.
   - Resolving an eligible incident is visible from the same injected store;
     invalid and ineligible resolutions report errors.
   - Stdio stdout contains protocol messages only; captured diagnostics, if
     any, are on stderr.

## Manual stdio smoke test

1. Start the server with `npm run --silent mcp` from the repository root. The
   `--silent` option prevents npm's lifecycle banner from contaminating MCP
   stdout; the `mcp` package script remains `tsx src/mcp/server.ts`.
2. Connect an MCP client to that command using stdio transport.
3. Initialize the session and list available tools.
   - **Expected**: The server identifies as `opspilot`; discovery shows
     `list_alerts`, `open_incidents`, and `resolve_incident`.
4. Call `list_alerts` and `open_incidents` without arguments.
   - **Expected**: The default filters are `firing` and `open`, respectively.
5. If an open incident is available in the configured store, call
   `resolve_incident` with its identifier and then list incidents with status
   `resolved`.
   - **Expected**: The resolved incident appears in the shared operational
     state. Use only a disposable local database for this mutating scenario.
6. Observe the process streams.
   - **Expected**: stdout is valid MCP protocol only; diagnostics are on
     stderr; no `console.log` output is emitted.

See [the MCP tool contract](./contracts/mcp-tools.md) for input fields,
defaults, result semantics, and failure behavior.
