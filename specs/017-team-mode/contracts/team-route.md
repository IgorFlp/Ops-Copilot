# Contract: Team Route

This feature adds one route to the existing chat interface. It introduces no new endpoint and no new response shape; it extends the accepted request value and the trace event vocabulary.

## 1. Chat request — `POST /chat`

The existing request body gains one accepted `strategy` value.

```json
{
  "userId": "string (non-empty)",
  "message": "string (non-empty)",
  "strategy": "react | plan-and-execute | reflect:react | team",
  "reflect": "boolean (default false)",
  "conversationId": "string (optional)"
}
```

Rules:
- `strategy: "team"` selects team mode explicitly (override).
- Any `strategy` value outside the enum MUST be rejected with a validation error (no team fallback).
- All existing fields and behaviours are unchanged.

## 2. Chat response — success

Unchanged from the other routes:

```json
{
  "answer": "string",
  "trace": [ "TraceEvent..." ],
  "metrics": {
    "calls": "number >= 0",
    "latencyMs": "number >= 0",
    "historyMessages": "number >= 0 (optional)",
    "promptTokens": "number >= 0 (optional)",
    "contextBreakdown": "object<string, number> (optional)"
  },
  "requestId": "string",
  "conversationId": "string (optional)"
}
```

Rules:
- Team mode MUST reuse this shape so existing chat and trace experiences keep working (FR-010, SC-010).
- A ceiling-stopped or failed run MUST be reflected through existing error semantics (a `DomainError` translated at the boundary), never as a fully successful answer (FR-012, SC-007).

## 3. Trace event — `handoff`

New event type added to the trace vocabulary. Unknown types remain preserved by consumers.

```json
{
  "type": "handoff",
  "node": "team",
  "content": "supervisor → analista: <brief>",
  "from": "supervisor",
  "to": "analista | planejador | executor",
  "brief": "string (non-empty)",
  "timestamp": "ISO-8601 string",
  "tools": "[string] (optional)",
  "args": "{object} (optional)"
}
```

Rules:
- One `handoff` is recorded per control transfer (FR-009, SC-002).
- `from`, `to` and `brief` are structured fields; `content` is the human-readable summary.
- The event MUST serialize within the existing trace payload persistence (no storage change required) (FR-014).
- Consumers that do not recognize `type: "handoff"` MUST still render it (passthrough + fallback label) (FR-015, SC-008).

## 4. Supervisor decision — structured output

The supervisor's per-step contract:

```json
{
  "next": "analista | planejador | executor | done",
  "brief": "string (non-empty)"
}
```

Rules:
- Validated with a Zod schema; invalid or missing fields raise a domain error (explicit failure, no guessing).
- `done` ends the run; any role value triggers a handoff to that role.

## 5. Role boundary contract

| Role | May read | May use tools | May mutate | May propose |
|------|----------|---------------|------------|-------------|
| Analista | yes | read-only tools only | no | no |
| Planejador | yes | no tools | no | no |
| Executor | yes | operational tools | only if authorized | yes |

Rules:
- Only the Executor may cause side effects; every mutation reuses the existing `isMutationAuthorized` policy, with no bypass (FR-006, FR-007, FR-008, SC-005).
- The ceiling is eight handoffs; when reached the run stops and reports the best available outcome or an explicit incomplete/failed outcome (FR-011, FR-012, SC-006).

## 6. Web trace rendering

- `TRACE_EVENT_TYPES` gains `"handoff"`; `TRACE_NODE_IDS` gains `"team"`.
- `TraceEventItem` renders `handoff` with a label and its `from` / `to` / `brief` details, in original order among other events.
- The rendering MUST follow the project design instructions (hierarchy, spacing scale, dark mode, accessibility).
