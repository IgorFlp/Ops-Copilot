# MCP Tool Contract

## Server connection

- **Server name**: `opspilot`
- **Transport**: stdio
- **Start command**: `npm run --silent mcp` (`tsx src/mcp/server.ts`)
- **NPM output**: Use npm's `--silent` option for stdio clients so npm's
  lifecycle banner does not become non-protocol stdout.
- **Protocol streams**: stdin receives MCP requests; stdout contains MCP
  protocol messages only. Diagnostics go to stderr. The server must not call
  `console.log`.

## Tools

All tools use the common Zod definitions shared with OpsPilot's existing
LangChain tools. The input field descriptions are surfaced through tool
discovery.

### `list_alerts`

Lists existing monitoring alerts without changing operational state.

| Field | Type | Required | Default | Accepted values |
|---|---|---:|---|---|
| `status` | string | No | `firing` | `firing`, `resolved`, `all` |

**Success result**: JSON text representing an array of existing alert records.

### `open_incidents`

Lists existing incidents without changing operational state. Despite the
legacy internal name `List_incidentes`, this exposed tool is read-only and
does not create an incident.

| Field | Type | Required | Default | Accepted values |
|---|---|---:|---|---|
| `status` | string | No | `open` | `open`, `resolved`, `all` |

**Success result**: JSON text representing an array of existing incident
records.

### `resolve_incident`

Resolves an existing eligible open incident and records its resolution time.

| Field | Type | Required | Constraints |
|---|---|---:|---|
| `id` | integer | Yes | Positive identifier of an existing open incident |

**Success result**: JSON text representing the resolved incident.

## Errors

- Schema validation failures, missing records, already-resolved incidents, and
  store failures are reported as MCP tool errors (`isError: true`) with a
  concise client-safe message.
- A failed operation must not return an empty collection or other result that
  implies success.
- Diagnostic details may be logged to stderr; private/internal details must
  not be exposed in client responses.
- No diagnostic or other non-protocol text may be written to stdout.
