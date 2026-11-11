# Phase 1 Data Model: Team Mode

This model describes the domain concepts of team mode. It is implementation-shaped only where the plan already fixes a contract (the `{next, brief}` decision and the `handoff` trace event); field names marked as fixed come directly from the feature request.

## Entity: Team Run

A single execution of the `team` route for one chat request.

| Field | Type | Notes |
|-------|------|-------|
| `input` | `ChatStrategyInput` | The same input consumed by the other strategies (message, history, memories, summary). |
| `handoffs` | `HandoffEvent[]` | Ordered control transfers recorded during the run. |
| `handoffCount` | `number` | Number of handoffs recorded so far; bounded by the ceiling (8). |
| `blackboard` | `TeamBlackboard` | Shared working state for the run. |
| `answer` | `string` | The single final answer (may be empty when the run ends incomplete). |
| `complete` | `boolean` | `false` when the run stopped at the ceiling or otherwise could not conclude. |
| `metrics` | `{ calls, latencyMs }` + `ModelTokenUsage` | Same shape as other strategies. |

**Validation / rules**
- `handoffCount` MUST never exceed `TEAM_MAX_HANDOFFS` (8) (FR-011).
- A run that ends with `complete = false` MUST NOT be presented as a fully successful answer (FR-012).
- `answer` MAY be empty only when `complete = false`; otherwise it MUST be non-empty (FR-010).

**State transitions**
`created → running → (finished | ceiling_reached | failed)`

## Entity: Supervisor Decision (fixed shape)

The structured output produced by the supervisor each step. Field names `next` and `brief` are fixed by the feature request.

| Field | Type | Notes |
|-------|------|-------|
| `next` | `"analista" \| "planejador" \| "executor" \| "done"` | The next actor to engage, or `done` to conclude. |
| `brief` | `string` (non-empty) | What the engaged actor should do. |

**Validation**
- MUST be validated via the Zod schema (provider + `safeParse`) (FR-003).
- Missing/empty `next` or `brief` MUST raise a `DomainError`, not be guessed (Edge cases, FR-003).

## Entity: Team Blackboard

Shared working state scoped to one team run (in-memory).

| Field | Type | Notes |
|-------|------|-------|
| `entries` | `BlackboardEntry[]` | Ordered contributions. |
| `historyBriefs` | `string[]` | The briefs passed in each handoff, in order. |

### BlackboardEntry

| Field | Type | Notes |
|-------|------|-------|
| `role` | `TeamRoleId` | Which role contributed. |
| `content` | `string` | The contribution (analysis, plan, or execution observation). |
| `at` | `string` (ISO-8601) | When it was produced. |

## Entity: Team Role

One of the specialized participants with a fixed capability boundary.

| Role id | Display | Tools | Mutations | Proposes actions |
|---------|---------|-------|-----------|------------------|
| `analista` | Analista | read-only only | never | never |
| `planejador` | Planejador | none | never | never |
| `executor` | Executor | operational | only under `isMutationAuthorized` | yes |

**Validation / rules**
- Analyst MUST NOT propose an action and MUST NOT execute one (FR-004, SC-003).
- Planner MUST use zero tools (FR-005, SC-004).
- Executor MUST route every mutation through `isMutationAuthorized`; no bypass (FR-006, FR-007, SC-005).

## Entity: Handoff (trace event, fixed type name)

A record of a control transfer between the supervisor and a role.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `"handoff"` | Fixed event type name from the feature request. |
| `node` | `"team"` | Trace attribution node. |
| `content` | `string` | Human-readable summary, e.g. `supervisor → analista: <brief>`. |
| `from` | `string` | Source of the transfer (e.g. `supervisor`). |
| `to` | `string` | Target of the transfer (a `TeamRoleId`). |
| `brief` | `string` | The brief passed to the target. |
| `timestamp` | `string` (ISO-8601) | When the transfer happened. |

**Validation / rules**
- Exactly one `handoff` MUST be recorded per control transfer (FR-009, SC-002).
- MUST be persisted through the existing trace store and rendered by the web "Ver raciocínio" panel (FR-014, SC-008).
- Unknown `type` values (on clients that predate the event) MUST still be preserved and displayed (FR-015).

## Entity: Team Route

The selectable route identifier.

| Field | Type | Notes |
|-------|------|-------|
| `strategy` | `"team"` | Added to the StrategyId union and the chat request enum. |

**Validation / rules**
- `"team"` MUST be an accepted value for the chat request `strategy`; any other unknown value MUST be rejected with a validation error (FR-001, SC-009).
- The response produced by the route MUST keep the existing chat response shape (answer, trace, metrics, requestId, conversationId) (FR-010, SC-010).

## Relationship map

```text
Chat Request (strategy="team")
   └─> Team Run
         ├─> Supervisor Decision {next, brief}   (one per step)
         ├─> Team Blackboard  (entries ← roles)
         ├─> Handoff trace events (one per transfer) ──> existing trace store ──> "Ver raciocínio"
         └─> Team Role: analista | planejador | executor
                     └─> (executor) Incident Service / ops tools (authorized only)
```
