# HTTP Contract: Chat Correlation and Request Retrieval

Base URL: `http://localhost:${PORT:-3000}`

## POST /chat

Existing chat endpoint, extended with request correlation. The request body is unchanged.

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

- Content type: `application/json`
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

- `requestId` is always present on accepted requests and equals the `X-Request-Id` header.
- Existing response fields keep their current shape and meaning.
- The trace is also persisted and retrievable through `GET /requests/:id`.

### Explicit Failure Responses

Accepted requests that fail still return `X-Request-Id`.

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid JSON or invalid body | `{ "error": "Invalid request", "issues": [...] }` |
| 404 | Referenced conversation does not exist | `{ "error": "Conversation not found" }` |
| 422 | Unsupported or invalid strategy | `{ "error": "..." }` |
| 500 | Internal failure or persistence failure | `{ "error": "Internal server error" }` |
| 503 | Model unavailable | `{ "error": "..." }` |
| 504 | Chat timeout | `{ "error": "Request timed out" }` |

Failures that reach persistence produce a `failed` request record with an error code; validation failures before acceptance do not require a record.

## GET /requests/:id

Returns the persisted request record and its trace in original production order.

### Request

```http
GET /requests/6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d
```

Path parameter `id`: required, non-empty request identifier. Identifiers are opaque and matched exactly.

### Success Response

Status: `200 OK`

Body:

```json
{
  "request": {
    "requestId": "6f1a2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
    "userId": "operator-1",
    "conversationId": "9b2f...",
    "strategy": "react",
    "status": "completed",
    "errorCode": null,
    "calls": 2,
    "latencyMs": 850,
    "historyMessages": 0,
    "promptTokens": 120,
    "contextBreakdown": { "currentMessage": 5 },
    "startedAt": "2026-11-10T12:00:00.000Z",
    "completedAt": "2026-11-10T12:00:01.000Z",
    "createdAt": "2026-11-10T12:00:01.000Z"
  },
  "trace": [
    {
      "position": 0,
      "node": "context",
      "type": "summarize",
      "payload": {
        "type": "summarize",
        "content": "..."
      },
      "createdAt": "2026-11-10T12:00:01.000Z"
    }
  ]
}
```

- `trace` is ordered by `position` ascending, matching production order.
- The trace is complete and untruncated.
- A failed request returns `"status": "failed"`, a non-null `errorCode`, and whatever trace was recorded.

### Not Found Response

Status: `404 Not Found`

```json
{ "error": "Request not found" }
```

Returned for unknown identifiers and for requests that have not settled.

### Invalid Identifier Response

Status: `400 Bad Request`

```json
{
  "error": "Invalid request",
  "issues": [{ "path": ["id"], "message": "Request id is required" }]
}
```

## Compatibility Notes

- Only additive changes are made to `POST /chat`; `requestId` and the header are new.
- The retrieval endpoint is new and does not affect existing routes.
- Error response shapes continue to follow the existing error handler.
