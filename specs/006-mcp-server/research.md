# Research: OpsPilot MCP Server

## Stable MCP TypeScript SDK and stdio transport

- **Decision**: Use the stable v1 API of `@modelcontextprotocol/sdk`, with
  `McpServer` and `StdioServerTransport`. Current official v1 documentation
  queried for this design is version 1.32.2.
- **Rationale**: The SDK documents this high-level server and transport for
  child-process integrations communicating over stdin/stdout. It supports
  tool registration with Zod schemas and is compatible with Zod v3.25 and
  later. The repository lockfile currently resolves Zod 4.6.7.
- **Alternatives considered**: The SDK v2 line is a separate API generation;
  prefer the documented stable v1 line for this feature rather than taking a
  migration or prerelease dependency. An HTTP transport is outside the
  requested stdio use case.
- **Sources**:
  - [TypeScript SDK v1.32.2 server documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.32.2/docs/server.md)
  - [TypeScript SDK v1.32.2 protocol documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.32.2/docs/protocol.md)
  - [TypeScript SDK v1.32.2 README](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.32.2/README.md)

## Shared Zod input contracts

- **Decision**: Move the three relevant schemas from `src/agents/tools.ts` to
  a shared module, exporting the alert-list, incident-list, and incident-
  resolution schemas. Both the existing LangChain tools and the MCP adapter
  will consume those schema definitions; the MCP SDK can register their
  object shapes as its `inputSchema`.
- **Rationale**: The current schemas are private constants in
  `src/agents/tools.ts`. Directly defining equivalent MCP schemas elsewhere
  would violate the single-source-of-truth requirement. The SDK's `registerTool`
  accepts Zod field shapes and converts them to JSON Schema for discovery and
  validation.
- **Alternatives considered**: Duplicating the schemas in the MCP server is
  explicitly excluded. Passing independent hand-written JSON Schema would
  similarly create a second contract.
- **Compatibility note**: SDK v1.32.2 documents compatibility with Zod v3.25+
  and Zod v4. The project currently uses Zod 4.6.7.

## Service, store, and state lifecycle

- **Decision**: Build the MCP adapter over `createIncidentService` and the
  shared `getDefaultOpsStore` instance. Keep the requested wire names
  (`list_alerts`, `open_incidents`, `resolve_incident`) separate from the
  LangChain tool names (`list_alerts`, `List_incidentes`, `resolve_incidente`).
  Close the default store during orderly process shutdown.
- **Rationale**: `createIncidentService` already implements alert listing,
  incident listing, and incident resolution against the `OpsStore` interface.
  `getDefaultOpsStore` lazily creates the application's shared SQLite store,
  and the current HTTP entry point closes it on termination.
- **Alternatives considered**: Creating a new store for the server would split
  operational state. Routing through `createOpsTools` would couple the MCP
  adapter to LangChain tool wrappers and internal tool names without adding
  domain behavior.
- **Sources**: `src/services/incident-service.ts`,
  `src/store/default-ops-store.ts`, and `src/index.ts`.

## MCP result and failure behavior

- **Decision**: Return successful operational records as JSON text in MCP
  content, consistent with the existing OpsPilot tools. Represent predictable
  operational failures as an MCP tool result with `isError: true` and a
  concise client-safe message; send diagnostic details only to stderr.
- **Rationale**: The SDK documents `isError: true` for a failed tool call. The
  project constitution requires explicit failures without leaking internal
  details, and stdio reserves stdout for protocol messages.
- **Alternatives considered**: Returning a normal-looking empty result or
  embedding failure details as a successful record is explicitly excluded.
  Writing diagnostics to stdout would corrupt the transport.
- **Source**: [TypeScript SDK v1.32.2 server documentation](https://github.com/modelcontextprotocol/typescript-sdk/blob/1.32.2/docs/server.md)

## Testing strategy and command

- **Decision**: Use `node:test` through `tsx`. Cover tool handlers with injected
  in-memory store data, and exercise initialization, discovery, and the stdio
  contract using a client/server transport test or a spawned child process.
  Add `npm run mcp` with the exact command `tsx src/mcp/server.ts`.
- **Rationale**: This follows the constitution and existing store/tool tests.
  The store's default database path requires no `.env` loading, so do not add
  environment-file handling to the command.
- **Alternatives considered**: Contacting a real monitoring provider is
  irrelevant to these local store tools. Starting a second persistent store
  for tests risks cross-test and development data pollution.
- **Sources**: `package.json`, `src/agents/tools.test.ts`,
  `src/store/sqlite-ops-store.test.ts`, and `src/models/database.ts`.

## Resolved unknowns

- Server and transport API: stable MCP TypeScript SDK v1 with stdio.
- Shared input validation: exported common Zod schemas consumed by both tool
  adapters.
- `open_incidents` semantics: list incidents, with `open` as its default
  status, as established in the feature specification.
- Environment setup: no env-file loader is needed for the default store.
