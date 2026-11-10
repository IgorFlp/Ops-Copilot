# Quickstart: Unified Production Graph

## Prerequisites

- Node.js 22.13.0+
- npm dependencies installed (`npm ci`)
- OpenRouter API key configured via environment variable `OPENROUTER_API_KEY`
- SQLite database initialized (`npm run seed`)

## Validation Scenarios

### 1. Run Graph Unit Tests
Tests the production graph in isolation with mocked model responses.

```bash
# Run only the production graph tests
npm test -- src/agent/production-graph.test.ts
```

**Expected**: All tests pass, covering:
- Automatic routing selects each of the three strategies
- Explicit strategy override bypasses router
- Invalid router output throws `UNSUPPORTED_STRATEGY`
- Every trace event has `node` attribution
- Route event includes `route` and `reason`
- Legacy `reflect: true` without strategy selects `reflect:react`

### 2. Run Chat Integration Tests
Tests the full `/chat` HTTP flow through controller → service → graph.

```bash
# Run chat controller and service tests
npm test -- src/controllers/chat-controller.test.ts src/services/chat-service.test.ts
```

**Expected**: All tests pass, covering:
- Automatic routing end-to-end
- Explicit strategy override end-to-end
- Invalid strategy returns 400 with `UNSUPPORTED_STRATEGY`
- Trace events include `node` on all events
- Response preserves `answer`, `conversationId`, `metrics`
- Legacy `reflect` flag behavior preserved

### 3. TypeCheck
Verifies TypeScript compilation with strict mode.

```bash
npm run typecheck
```

**Expected**: Zero errors.

### 4. Full Test Suite
Runs all tests including arena, bench, and other modules.

```bash
npm test
```

**Expected**: All tests pass.

## Manual Verification (Optional)

### Start Development Server
```bash
npm run dev
```
Server starts on `http://localhost:3000`.

### Test Automatic Routing
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "message": "List all critical alerts"
  }'
```

**Verify**:
- Response has `answer`, `trace[]`, `metrics`, `conversationId`
- Trace contains a `route` event with `node: "route"` and content like `{"route":"react","reason":"..."}`
- All trace events have a `node` field (`context`, `route`, `react`, etc.)
- No `strategy` in request → router was invoked

### Test Explicit Strategy Override
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "message": "Create a plan to resolve the checkout incident",
    "strategy": "plan-and-execute"
  }'
```

**Verify**:
- Trace contains a `route` event with `content` indicating override: `{"route":"plan-and-execute","reason":"Explicit override: plan-and-execute"}`
- Strategy events have `node: "plan-and-execute"`
- No automatic routing decision implied

### Test Legacy Reflect Flag
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "message": "Analyze this incident",
    "reflect": true
  }'
```

**Verify**:
- Strategy selected is `reflect:react`
- Trace shows `node: "reflect:react"` on strategy events
- Route event reason mentions `reflect` flag

### Test Invalid Strategy
```bash
curl -X POST http://localhost:3000/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "message": "Test",
    "strategy": "invalid-strategy"
  }'
```

**Verify**:
- HTTP 400 response
- Error code: `UNSUPPORTED_STRATEGY`
- Message lists supported strategies

## Expected Artifacts After Implementation

| Artifact | Path | Purpose |
|---|---|---|
| Production Graph | `src/agent/production-graph.ts` | Main graph implementation |
| Graph Tests | `src/agent/production-graph.test.ts` | Unit tests for graph nodes and routing |
| Chat Service Updates | `src/services/chat-service.ts` | Invoke graph, merge traces |
| Chat Controller Updates | `src/controllers/chat-controller.ts` | Validate optional `strategy` field |
| Agent Types | `src/agents/types.ts` | Add `AttributedTraceEvent`, `RouteDecision` |
| Agent Index | `src/agent/index.ts` | Export graph, updated registry |

## Related Documents

- [Data Model](./data-model.md) — Entity definitions and state machine
- [Chat API Contract](./contracts/chat-api.yaml) — Request/response schemas
- [Research](./research.md) — Design decisions and rationale
- [Feature Spec](../spec.md) — Requirements and acceptance criteria