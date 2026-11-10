# Research: Persisted Trace and JSON Logs

**Feature**: `015-persisted-trace-json-logs`

**Date**: 2026-11-10

All technical unknowns from the plan's Technical Context were resolved from the existing codebase and platform capabilities. No `NEEDS CLARIFICATION` items remain.

## Decision 1: Request identifier generation and propagation

**Decision**: Generate the `requestId` in the chat controller with `randomUUID()` from `node:crypto` before validation and set `X-Request-Id` on the response immediately. Pass the identifier into the chat service input so every service-level log line can include it.

**Rationale**: The controller owns HTTP concerns (headers and status codes), and generating before validation lets accepted and rejected requests share one correlation identifier. `randomUUID()` is built into Node.js 22, collision-resistant, and requires no dependency.

**Alternatives considered**:
- Client-supplied identifier: rejected because it allows collisions and lets callers spoof correlation across users.
- Generate inside the chat service: rejected because the controller must set the HTTP header even when the service fails or times out.
- Incrementing counter: rejected because it is not unique across processes/restarts.

## Decision 2: Structured JSON logging

**Decision**: Add `src/obs/logger.ts` exposing `logEvent(event, fields)` that serializes one JSON object per event to the existing stderr destination. Keep `src/lib/log.ts` as a compatibility layer that re-exports/delegates `logEvent` and retains `errorDetail`. The logger normalizes `Error` values, drops `undefined` fields, rejects values that cannot be serialized, and emits a fixed shape: `timestamp`, `event`, then metadata fields.

**Rationale**: Centralizing output guarantees one valid JSON line per event, keeps existing call sites working, and provides one place to enforce metadata-only logging. The existing hand-formatted `[opspilot] key=value` output is not machine-parseable.

**Alternatives considered**:
- Replacing all 41 call sites with direct `JSON.stringify` calls: rejected as noisy and error-prone.
- Adding a logging library: rejected; the constitution favors no new dependencies for a small, well-understood need.
- Using `console.log`: rejected because the existing destination is stderr and multi-argument console calls can escape the one-line guarantee.

## Decision 3: Metadata-only enforcement

**Decision**: Define an explicit forbidden-key policy in the logger for content-bearing fields (message text, answer text, prompts, tool arguments, memory facts, secrets/credentials) and coerce all accepted values to primitives/JSON-safe structures. `errorDetail` output remains limited to error name, message, and code.

**Rationale**: The spec forbids content leakage while allowing identifiers, counts, durations, node names, strategy names, and error metadata. A centralized policy is testable and prevents future call sites from accidentally logging payloads.

**Alternatives considered**:
- Allowlist-only fields: too restrictive for the breadth of existing event metadata and would require rewriting every call site.
- Trust callers to pass only metadata: rejected because it has no enforcement and is not testable.

## Decision 4: Persistence schema and ordering

**Decision**: Create two tables in the existing SQLite database:
- `request`: one row per accepted chat request, primary keyed by `request_id`, with outcome, error code, metrics, timestamps, conversation/user/strategy metadata, and a JSON-encoded context breakdown.
- `trace_events`: one row per trace event, foreign-keyed to `request` with `ON DELETE CASCADE`, carrying `position` (0-based), `node`, `type`, and a JSON-encoded `payload`, with a unique constraint on `(request_id, position)`.

Insert the request row and all trace rows in one transaction. Retrieve trace rows ordered by `position ASC`.

**Rationale**: Matches the input requirement (`request` metrics, `trace_events` with node and payload) and guarantees atomicity: a request never appears with a partial trace. A monotonic position is more reliable than timestamps for ordering when events share a millisecond.

**Alternatives considered**:
- Storing the whole trace as one JSON column on `request`: rejected because the requirement names `trace_events` and separate rows are easier to inspect and extend.
- Ordering by timestamp: rejected because timestamps can duplicate or be absent; position is deterministic.
- Separate database file: rejected; the project already centralizes operational persistence in one SQLite database.

## Decision 5: Persistence timing and failure behavior

**Decision**: The controller persists via a new `RequestTraceService` after the chat service settles. On success it records `status = completed`, the result metrics, and the full attributed trace. On explicit failure it records `status = failed`, the error code, duration, and any trace available (empty when the failure occurred before trace production). Persistence runs before the response is sent; if persistence fails, the controller logs the failure and returns an explicit internal error rather than a success-shaped response.

**Rationale**: The controller is the only layer that sees both the final outcome and the HTTP request identifier. Persisting before responding prevents a client from receiving a success response for a request that cannot be retrieved. This satisfies the spec's explicit-failure requirement.

**Alternatives considered**:
- Persist inside the chat service: rejected because failures thrown before/inside the graph would require duplicating handling in many branches, and the service does not own the request identifier lifecycle.
- Fire-and-forget background write: rejected because a process exit could silently lose records, violating the explicit-failure principle.
- Return success even when persistence fails: rejected by the constitution and FR-013.

## Decision 6: Duplicate and unknown identifiers

**Decision**: `requestId` is a primary key, so a duplicate insert fails explicitly instead of merging traces. Retrieval of an unknown identifier returns a `DomainError` with code `NOT_FOUND`, translated to HTTP 404 by the existing error handler. Records are inserted only after the request settles, so in-flight requests are not retrievable and return 404.

**Rationale**: Server-generated UUIDs make duplicates practically impossible; still, the database constraint prevents silent corruption. Not exposing partial in-flight records matches the spec edge case.

**Alternatives considered**:
- Upsert on duplicate: rejected because it would overwrite an existing trace.
- In-memory pending registry: rejected as unnecessary complexity; 404 for in-flight is acceptable.

## Decision 7: HTTP contract evolution and compatibility

**Decision**: Extend the successful `POST /chat` JSON body with `requestId` while preserving all existing fields. Return `X-Request-Id` on chat responses, including explicit failure responses for accepted requests. Add `GET /requests/:id` returning `{ request, trace }` with `200`, and `404` for unknown identifiers. Validate a non-empty `:id` at the boundary.

**Rationale**: Additive body changes preserve existing consumers except tests that assert exact response equality, which will be updated. The header provides correlation for clients that only inspect headers.

**Alternatives considered**:
- HTTP-only identifier: rejected because the input explicitly requires it in the body.
- Nested response envelope (e.g., `{ data: ... }`): rejected as a breaking change.

## Decision 8: Table creation without a migration framework

**Decision**: Create the new tables with `CREATE TABLE IF NOT EXISTS` and indexes in the SQLite request store constructor, matching the existing store pattern. No migration tooling is introduced.

**Rationale**: The repository already relies on idempotent schema creation in each store constructor; following the convention keeps changes small and consistent.

**Alternatives considered**:
- Adding a migration framework: rejected as disproportionate for two additive tables.
- Creating tables in `src/models/database.ts`: rejected because each store currently owns its own schema.

## Decision 9: Concurrency and correlation

**Decision**: Use a request-scoped object containing the identifier, start time, and outcome; perform one transactional insert per request; keep default stores process-wide and synchronous. Tests will exercise at least 20 concurrent requests and assert that every response, record, and trace event maps to its own identifier.

**Rationale**: `node:sqlite` is synchronous, so each insert completes atomically before the next statement; UUID keys and per-request arrays prevent cross-request mixing. Concurrent correctness is verified rather than assumed.

**Alternatives considered**:
- Global mutable buffer for trace events: rejected because it would mix events across concurrent requests.
- Asynchronous write queue: rejected for the same persistence-loss reason as Decision 5.
