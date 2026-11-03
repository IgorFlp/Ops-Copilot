# Data Model: OpsPilot MCP Server

The MCP feature introduces no new persisted entities or operational state. Its
server session and tool inputs are transport-level representations of existing
OpsPilot operations and records.

## MCP Server

- **Identity**: Name `opspilot`; version identifies the server release.
- **Transport**: One local stdio connection. Standard input receives protocol
  messages and standard output carries protocol messages only.
- **Lifecycle**: Initialize, serve tool-list and tool-call requests, then close
  the shared operational store on orderly process shutdown.
- **Relationships**: Each client session can discover and invoke the three
  registered tools. The server delegates their operations to the existing
  incident service and default operational store.

## Tool input contracts

| Tool | Input | Validation and default |
|---|---|---|
| `list_alerts` | `status` | Optional enum `firing`, `resolved`, `all`; defaults to `firing`. |
| `open_incidents` | `status` | Optional enum `open`, `resolved`, `all`; defaults to `open`. |
| `resolve_incident` | `id` | Required positive integer incident identifier. |

These are references to the existing Zod validation rules, not new independent
schemas. The MCP and LangChain adapters must consume the shared definitions.

## Operational entities

### Alert

An existing `AlertRecord` returned by `OpsStore.listAlerts`: identifier,
fixture key, service identifier and name, title, description, status, and
severity. The list operation filters by `firing`, `resolved`, or `all` and does
not mutate state.

### Incident

An existing `IncidentRecord` returned by `OpsStore.listIncidents` or
`OpsStore.resolveIncident`: identifier, service identifier and name, title,
severity, status, optional summary, and optional resolution timestamp.

Supported states are `open` and `resolved`. Listing is read-only. Resolution
transitions an eligible open incident to resolved and records its resolution
time. Invalid identifiers, missing incidents, and ineligible repeated
resolutions fail explicitly.

### Operational store

The existing SQLite-backed `OpsStore` remains the only source of operational
state. The MCP server uses the same lazily-created default store as the other
application interfaces; it does not add tables, copy records, or seed a
separate dataset.

## Tool result lifecycle

- Successful listing and resolution results carry serialized existing
  operational records as MCP text content.
- A predictable operation failure is a failed MCP tool result, not a
  success-shaped record.
- Private diagnostic information is written only to stderr, never returned as
  an internal error detail to the client or written to protocol stdout.
