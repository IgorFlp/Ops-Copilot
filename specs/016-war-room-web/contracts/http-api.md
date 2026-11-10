# HTTP Contract: War Room Web

**Feature**: `016-war-room-web` | **Date**: 2026-11-10

Base URL: operator-configured (default `http://localhost:3000`). All requests are JSON and cross-origin from the war room origin.

## CORS

The API MUST accept cross-origin requests from the war room origin.

- Allowed origins come from `CORS_ALLOWED_ORIGINS` (comma-separated). Same-origin requests are always allowed.
- Preflight `OPTIONS` requests MUST return `204` with:
  - `Access-Control-Allow-Origin: <request origin>` when allowlisted
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, X-Request-Id`
  - `Access-Control-Max-Age: 600`
- Non-allowlisted origins MUST NOT receive `Access-Control-Allow-Origin`.
- `Vary: Origin` MUST be set on responses that depend on the origin.

## POST /chat

Existing chat endpoint. The request body is unchanged.

### Request

```json
{
  "userId": "operator-1",
  "message": "Check alerts for checkout",
  "strategy": "react",
  "reflect": false,
  "conversationId": "optional-existing-conversation"
}
```

- `userId` and `message`: required non-empty strings.
- `strategy`: optional, one of `react`, `plan-and-execute`, `reflect:react`.
- `reflect`: optional boolean, defaults to `false`.
- `conversationId`: optional non-empty string.
- Unknown fields are rejected.

### Success Response

Status: `200 OK`

Headers:

```http
Content-Type: application/json
X-Request-Id: 6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d
```

Body:

```json
{
  "answer": "Checkout latency is elevated...",
  "trace": [
    {
      "type": "answer",
      "content": "Checkout latency is elevated...",
      "node": "react",
      "timestamp": "2026-11-10T12:00:00.000Z"
    }
  ],
  "conversationId": "9b2f...",
  "metrics": {
    "calls": 2,
    "latencyMs": 850,
    "historyMessages": 0,
    "promptTokens": 120,
    "contextBreakdown": { "currentMessage": 5 }
  },
  "requestId": "6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d"
}
```

### Pending Approval Response

Status: `202 Accepted`

Headers:

```http
Content-Type: application/json
X-Request-Id: 6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d
```

Body:

```json
{
  "status": "pending_approval",
  "requestId": "6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
  "conversationId": "9b2f...",
  "approval": {
    "approvalId": "apv_01J...",
    "requestId": "6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
    "action": {
      "tool": "open_incidente",
      "summary": "Open a P1 incident for checkout latency",
      "args": { "severity": "P1", "service": "checkout" }
    },
    "expiresAt": "2026-11-10T12:05:00.000Z"
  }
}
```

- The client MUST render an approve/deny card from this payload.
- If `action.summary` is missing, the client MUST still show the card using the available fields.

### Explicit Failure Responses

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON or invalid body | `{ "error": "Invalid request", "issues": [...] }` |
| 404 | Referenced conversation does not exist | `{ "error": "Conversation not found" }` |
| 422 | Unsupported or invalid strategy | `{ "error": "..." }` |
| 500 | Internal failure or persistence failure | `{ "error": "Internal server error" }` |
| 503 | Model unavailable | `{ "error": "..." }` |
| 504 | Chat timeout | `{ "error": "Request timed out" }` |

## POST /approvals/:approvalId/decision

Submits the operator's decision for a pending approval.

### Request

```http
POST /approvals/apv_01J.../decision
Content-Type: application/json
```

```json
{
  "decision": "approve",
  "userId": "operator-1"
}
```

- `decision`: required, `approve` or `deny`.
- `userId`: required non-empty string.

### Success Response

Status: `200 OK`

```json
{
  "approvalId": "apv_01J...",
  "status": "approved",
  "requestId": "6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
  "result": {
    "answer": "Incident opened.",
    "trace": [],
    "metrics": { "calls": 1, "latencyMs": 120 },
    "requestId": "6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
    "conversationId": "9b2f..."
  }
}
```

- `status` is `approved` or `denied`.
- `result` is present when the decision resumes execution and produces a chat response.

### Failure Responses

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid body or decision | `{ "error": "Invalid request", "issues": [...] }` |
| 404 | Unknown approval | `{ "error": "Approval not found" }` |
| 409 | Approval already decided or expired | `{ "error": "Approval is no longer pending" }` |
| 500 | Internal failure | `{ "error": "Internal server error" }` |

## GET /requests/:id

Optional. Used only if the client needs to reload a persisted trace that is not present in the chat response.

- Returns the persisted request record and its ordered trace, as defined in `specs/015-persisted-trace-json-logs/contracts/http-api.md`.
- The war room does not require this endpoint for the primary flow.

## Dependency Note

The current API does not emit `202` or expose `POST /approvals/:approvalId/decision`. This contract is the target the client is built against. The API-side implementation is a dependency of this feature and must land before the approval card can appear in production. The client is tested against deterministic fixtures that implement this contract.
