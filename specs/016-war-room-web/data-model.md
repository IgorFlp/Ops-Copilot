# Phase 1 Data Model: War Room Web

**Feature**: `016-war-room-web` | **Date**: 2026-11-10

This model describes the client-side types and state. It is not a server persistence model; the API remains the source of truth for requests, traces, and approvals.

## Entities

### ApiConfig

The operator-selected API endpoint.

| Field | Type | Rules |
|-------|------|-------|
| `baseUrl` | `string` | Required; absolute `http:` or `https:` URL; trimmed; trailing slash removed |
| `updatedAt` | `string` (ISO 8601) | Set when saved |

- Persisted in `localStorage` under `opspilot.apiBaseUrl.v1`.
- Default comes from `VITE_API_BASE_URL` when present; otherwise the current origin.
- Invalid values are rejected and the previous valid value is kept.

### ThemePreference

| Field | Type | Rules |
|-------|------|-------|
| `mode` | `"system" \| "light" \| "dark"` | Defaults to `"system"` |

- Persisted under `opspilot.theme.v1`.
- Resolved theme is applied as `data-theme="light" | "dark"` on the root element.

### ChatMessage

| Field | Type | Rules |
|-------|------|-------|
| `id` | `string` | Client-generated unique id |
| `role` | `"user" \| "assistant"` | Author |
| `content` | `string` | Non-empty for user messages; may be empty while streaming/loading |
| `createdAt` | `string` (ISO 8601) | Creation time |
| `status` | `"sending" \| "sent" \| "failed"` | Lifecycle of the message |

### ChatRequest

| Field | Type | Rules |
|-------|------|-------|
| `userId` | `string` | Required; operator identity |
| `message` | `string` | Required; trimmed; non-empty |
| `strategy` | `"react" \| "plan-and-execute" \| "reflect:react"` | Optional |
| `reflect` | `boolean` | Optional; defaults to `false` |
| `conversationId` | `string` | Optional; sent after the first response |

### ChatResponse

| Field | Type | Rules |
|-------|------|-------|
| `answer` | `string` | Required |
| `trace` | `TraceEvent[]` | May be empty |
| `metrics` | `ChatMetrics` | Required |
| `requestId` | `string` | Required; matches `X-Request-Id` |
| `conversationId` | `string` | Required for continuity |

### ChatMetrics

| Field | Type | Rules |
|-------|------|-------|
| `calls` | `number` | Non-negative integer |
| `latencyMs` | `number` | Non-negative |
| `historyMessages` | `number` | Optional; non-negative integer |
| `promptTokens` | `number` | Optional; non-negative integer |
| `contextBreakdown` | `Record<string, number>` | Optional |

### TraceEvent

A discriminated union keyed by `type`.

| Field | Type | Rules |
|-------|------|-------|
| `type` | `TraceEventType` | One of the known types |
| `content` | `string` | Required |
| `node` | `TraceNodeId` | Optional; originating node |
| `timestamp` | `string` (ISO 8601) | Optional |
| `tools` | `string[]` | Optional; for `action` events |
| `args` | `Record<string, unknown>` | Optional; for `action` events |
| `approved` | `boolean` | Optional; for `critique` events |

`TraceEventType`: `thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`, `route`, `context`, `fallback`.

`TraceNodeId`: `context`, `route`, `react`, `plan-and-execute`, `reflect:react`, `summary`.

- Unknown `type` values are accepted at the boundary and rendered with a raw-content fallback.

### PendingApproval

Returned by `POST /chat` with status 202.

| Field | Type | Rules |
|-------|------|-------|
| `approvalId` | `string` | Required; opaque |
| `requestId` | `string` | Required |
| `conversationId` | `string` | Optional |
| `action.tool` | `string` | Required; proposed tool |
| `action.summary` | `string` | Required; human-readable description |
| `action.args` | `Record<string, unknown>` | Optional; proposed arguments |
| `expiresAt` | `string` (ISO 8601) | Optional |
| `status` | `"pending" \| "approved" \| "denied"` | Client-side status |

### ApprovalDecision

| Field | Type | Rules |
|-------|------|-------|
| `decision` | `"approve" \| "deny"` | Required |
| `userId` | `string` | Required |

### ApprovalResult

| Field | Type | Rules |
|-------|------|-------|
| `approvalId` | `string` | Required |
| `status` | `"approved" \| "denied"` | Required |
| `requestId` | `string` | Required |
| `result` | `ChatResponse` | Optional; present when approval resumes execution |

### ApiError

| Field | Type | Rules |
|-------|------|-------|
| `status` | `number` | HTTP status or `0` for connectivity failure |
| `code` | `string` | Stable client code (e.g. `VALIDATION`, `UNSUPPORTED_STRATEGY`, `NOT_FOUND`, `TIMEOUT`, `MODEL_UNAVAILABLE`, `INTERNAL`, `NETWORK`) |
| `message` | `string` | User-facing message |
| `issues` | `{ path: (string \| number)[]; message: string }[]` | Optional; validation issues |

## State Transitions

### Chat request

```text
idle -> sending -> succeeded
                -> failed (retryable)
```

- `sending` disables the composer and shows a loading state.
- `succeeded` appends the assistant message, metrics, request id, and trace.
- `failed` keeps the user message visible with a retry action and a distinct error state.

### Pending approval

```text
pending -> submitting -> approved
                      -> denied
                      -> failed (card remains actionable)
```

- `submitting` disables both buttons and prevents duplicate submissions.
- `approved`/`denied` replaces the card with the authoritative outcome.
- `failed` re-enables the card and shows a retryable error.

### API configuration

```text
default -> editing -> saved
                   -> invalid (previous value kept)
```

## Validation Rules

- `message` is trimmed and must be non-empty before sending.
- `baseUrl` must parse as an absolute URL with `http:` or `https:`; empty or malformed values are rejected.
- `decision` must be exactly `approve` or `deny`.
- API responses are validated with Zod before being stored in state; invalid payloads become an `INTERNAL`-style client error rather than rendering partial data.
- Trace events with unknown `type` are preserved and rendered with a fallback, never dropped.
