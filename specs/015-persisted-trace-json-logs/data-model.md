# Data Model: Persisted Trace and JSON Logs

**Feature**: `015-persisted-trace-json-logs`

**Storage**: SQLite through `node:sqlite`, in the database resolved by `src/models/database.ts` (default `./data/opspilot.db`, overridable with `OPSPILOT_DB`, with `:memory:` supported for tests).

## Entity: Request Record

Represents one accepted chat request. Created once after the request settles and never updated.

| Field | Type | Nullable | Rules |
|-------|------|----------|-------|
| `request_id` | TEXT | no | Primary key; server-generated UUID; stable across body, header, logs, and trace |
| `user_id` | TEXT | no | Non-empty; copied from the validated chat request |
| `conversation_id` | TEXT | yes | Present when the chat produced or used a conversation |
| `strategy` | TEXT | yes | Selected or requested strategy identifier; absent when routing did not complete |
| `status` | TEXT | no | `completed` or `failed` |
| `error_code` | TEXT | yes | Present only when `status = failed`; one of the known domain error codes |
| `calls` | INTEGER | yes | Number of model/tool calls; absent for failures before metrics exist |
| `latency_ms` | INTEGER | yes | Non-negative; absent when unknown |
| `history_messages` | INTEGER | yes | Non-negative count of history messages used |
| `prompt_tokens` | INTEGER | yes | Non-negative when reported by the provider |
| `context_breakdown` | TEXT | yes | JSON object with token counts per context section |
| `started_at` | TEXT | no | ISO-8601 timestamp captured before chat execution |
| `completed_at` | TEXT | yes | ISO-8601 timestamp when the outcome was known |
| `created_at` | TEXT | no | ISO-8601 insert timestamp |

**Validation rules**:
- `request_id` must be non-empty and unique.
- `status` is restricted to `completed` or `failed`.
- `error_code` is required when failed and absent when completed.
- Numeric metrics must be non-negative integers when present.
- `context_breakdown` must be JSON-serializable when present.

**Lifecycle**:
1. In flight: no row exists; retrieval returns not found.
2. Settled: exactly one row is inserted with `completed` or `failed`.
3. Immutable: no update or upsert path exists.

## Entity: Trace Event

Represents one trace event produced during a request. Zero or more rows belong to each request.

| Field | Type | Nullable | Rules |
|-------|------|----------|-------|
| `id` | INTEGER | no | Primary key, auto-assigned |
| `request_id` | TEXT | no | Foreign key to `request.request_id`, `ON DELETE CASCADE` |
| `position` | INTEGER | no | 0-based order within the request; unique per request |
| `node` | TEXT | no | Non-empty originating node identifier |
| `type` | TEXT | no | Non-empty trace event type |
| `payload` | TEXT | no | JSON object containing the event fields (content, tools, args, timestamps, and node-specific fields) |
| `created_at` | TEXT | no | ISO-8601 insert timestamp |

**Validation rules**:
- `position` must be a non-negative integer and contiguous from 0 within a request.
- `(request_id, position)` is unique.
- `node` and `type` must be non-empty strings.
- `payload` must be JSON-serializable.
- Trace rows are inserted in the same transaction as their request row.

## Relationships

```text
Request Record (1) ───< (N) Trace Event
```

- One request has zero or more trace events; deletion of a request cascades to its trace events.
- Trace events never exist without a request.
- Retrieval returns the request plus trace ordered by `position ASC`.

## Indexes and Constraints

```sql
CREATE TABLE IF NOT EXISTS "request" (
  request_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  conversation_id TEXT,
  strategy TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  error_code TEXT,
  calls INTEGER,
  latency_ms INTEGER,
  history_messages INTEGER,
  prompt_tokens INTEGER,
  context_breakdown TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS trace_events (
  id INTEGER PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES "request"(request_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  node TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (request_id, position)
);

CREATE INDEX IF NOT EXISTS trace_events_request_id_position_idx
  ON trace_events(request_id, position);
```

The `request` identifier is quoted because `REQUEST` is a SQL keyword in some SQLite contexts; quoting keeps the table name required by the feature while remaining portable.

## Mapping Notes

- Application-facing names are camelCase (`requestId`, `conversationId`, `latencyMs`, `historyMessages`, `promptTokens`, `contextBreakdown`, `startedAt`, `completedAt`); database columns are snake_case, as in the existing stores.
- The API returns `request` and `trace` objects; the trace payload is returned as a parsed JSON object, not a string.
- Log lines describe events but are not a persistence source of truth; the database is authoritative.
