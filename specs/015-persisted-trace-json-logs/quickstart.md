# Quickstart: Persisted Trace and JSON Logs

**Feature**: `015-persisted-trace-json-logs`

This guide validates the feature end-to-end. It references the contracts and data model rather than duplicating implementation details.

## Prerequisites

- Node.js >= 22.13
- Dependencies installed (`npm install`)
- No `.env` reading or editing; use process environment variables only. For the validation below, the existing seeded/local setup is sufficient.

## 1. Static and automated validation

From the repository root:

```powershell
npm run typecheck
npm test
```

Expected: both commands pass. The feature tests cover:

- `src/obs/logger.test.ts` — every emitted line is valid JSON, one line per event, metadata only.
- `src/store/sqlite-request-store.test.ts` — transactional request + ordered trace persistence, retrieval order, unknown identifier, duplicate identifier.
- `src/services/request-trace-service.test.ts` — completed and failed record orchestration.
- `src/controllers/request-controller.test.ts` — `200` and `404` retrieval behavior.
- `src/controllers/chat-controller.test.ts` and `src/controllers/chat-errors.test.ts` — `requestId` in body and `X-Request-Id`, successful and failed persistence, concurrency correlation.

## 2. Start the service

```powershell
npm run dev
```

The server listens on `http://localhost:3000` by default (or `PORT` when set). Logs are written to stderr as one JSON object per line.

## 3. Submit a chat request and capture the identifier

```powershell
$response = Invoke-WebRequest -Uri "http://localhost:3000/chat" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"userId":"operator-1","message":"Check alerts for checkout"}'

$response.StatusCode
$response.Headers["X-Request-Id"]
($response.Content | ConvertFrom-Json) | Select-Object requestId, conversationId
```

Expected:

- Status `200`.
- `X-Request-Id` is a non-empty UUID.
- The body contains the identical `requestId` and the existing answer/trace/metrics fields.

See [contracts/http-api.md](./contracts/http-api.md) for the full response shape.

## 4. Retrieve the persisted record and ordered trace

```powershell
$requestId = $response.Headers["X-Request-Id"]
$record = Invoke-RestMethod -Uri "http://localhost:3000/requests/$requestId"
$record.request | Format-List
$record.trace | Select-Object position, node, type
```

Expected:

- `request.status` is `completed` (or `failed` for an explicit failure).
- `trace` is a non-empty ordered list when the request produced events.
- Positions are ascending and start at `0`.
- No event is truncated.

See [data-model.md](./data-model.md) for field definitions.

## 5. Verify unknown identifiers

```powershell
try {
  Invoke-RestMethod -Uri "http://localhost:3000/requests/does-not-exist"
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected: `404` with an explicit not-found error, never a partial or empty success record.

## 6. Verify structured logs

Redirect stderr while running a request in a separate terminal, for example:

```powershell
npm run dev 2> logs.jsonl
```

Then inspect the first lines:

```powershell
Get-Content logs.jsonl | ForEach-Object { $_ | ConvertFrom-Json }
```

Expected:

- Every non-empty line parses as JSON.
- Chat-related lines include `requestId`.
- No user message text, answer text, prompts, tool arguments, memory facts, or secrets appear.

See [contracts/log-line.md](./contracts/log-line.md) for the line schema and forbidden content.

## 7. Verify concurrency correlation

Submit at least 20 concurrent chat requests and assert that each response's `requestId` matches its `X-Request-Id` and that retrieval returns only that request's trace. This is also covered by the automated controller tests.

## Troubleshooting

- `404` immediately after `POST /chat`: ensure the `requestId` used is the one returned by that exact response; unsent or in-flight requests are intentionally not retrievable.
- `500` after a successful chat: persistence failed explicitly; inspect the `request.persist_failure` log line and the database path (`OPSPILOT_DB`).
- Log lines are not valid JSON: confirm the running process uses the updated `src/obs/logger.ts` and that no direct `console` logging was introduced for operational events.
