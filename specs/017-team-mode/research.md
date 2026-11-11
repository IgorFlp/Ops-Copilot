# Phase 0 Research: Team Mode

This document resolves the open questions behind the plan's Technical Context. No `NEEDS CLARIFICATION` markers remain.

## R1. How the supervisor produces its `{next, brief}` decision

- **Decision**: Use `createModel().withStructuredOutput(supervisorDecisionSchema, { includeRaw: true })` with a Zod schema `{ next: enum(["analista","planejador","executor","done"]), brief: string.min(1) }`, then validate the returned value again with `safeParse`, mirroring `routerNode` in `src/agent/production-graph.ts`.
- **Rationale**: The codebase already uses `withStructuredOutput` for the router (`production-graph.ts`) and the reflection critic (`reflection.ts`). This keeps the decision typed, validated twice (provider + `safeParse`), and rejects malformed output with a `DomainError` instead of guessing.
- **Alternatives considered**: `method: "jsonMode"` with manual parsing and a bespoke candidate extractor, as in `plan-and-execute.ts`. Rejected as heavier than needed; the router pattern already proves `withStructuredOutput` works with this project's OpenRouter setup and gives a clean `{next, brief}` shape. A free-text decision was rejected because it is not reliably parseable and would violate the "explicit failure, no guessing" requirement.

## R2. How to model the supervisory loop and enforce the ceiling of eight handoffs

- **Decision**: Implement the loop as a small `StateGraph` (LangGraph `Annotation`) with a `supervisor` node, three role nodes (`analista`, `planejador`, `executor`), and a `handoffs` counter in the annotation state. The supervisor node returns the decision; a conditional edge dispatches by `next`; every role node routes back to `supervisor`; `done` ends the run. A run also ends when `handoffs` reaches `TEAM_MAX_HANDOFFS = 8`, returning the best available answer or an explicit incomplete outcome.
- **Rationale**: LangGraph state graphs are the established multi-step pattern here (`production-graph.ts`, `plan-and-execute.ts`, `react.ts`). The counter makes the ceiling deterministic and testable, matching how `maxIterations` bounds the other strategies.
- **Alternatives considered**: A plain `while` loop outside LangGraph. Rejected for consistency with the rest of the reasoning layer and because it would duplicate state/trace bookkeeping that the graph already provides. A `recursionLimit`-only bound was rejected because it counts graph steps, not handoffs, and would not express the "eight handoffs" contract precisely.

## R3. How role boundaries are enforced

- **Decision**:
  - **Analista**: engaged with read-only operations only; it MUST NOT emit a proposed action and MUST NOT execute any tool that changes state. Its contributions are observations/analysis.
  - **Planejador**: engaged with zero tools; it returns a plan/contribution using only prior blackboard content.
  - **Executor**: the only role allowed to cause side effects; it reuses `createOpsToolsForRequest` / `invokeOpsTool` and the existing `isMutationAuthorized` gate in `src/agents/mutation-policy.ts`.
- **Rationale**: This reuses existing, already-tested authorization (`plan-and-execute.ts` calls `isMutationAuthorized` before any mutation and `createOpsToolsForRequest` filters mutation tools by authorization). Reuse guarantees no bypass and keeps behaviour identical to the other routes.
- **Alternatives considered**: A new team-specific authorization layer. Rejected — it would risk diverging from the safety policy and violate FR-007 ("no bypass"). Giving the Planner tools "just in case" was rejected — the spec explicitly requires a tool-free planner.

## R4. How the `team` route plugs into routing and the API boundary

- **Decision**: Treat `team` as a first-class `StrategyId`. Register it in `strategyRegistry` (`src/agent/index.ts`), add it to the router decision enum and the override conditional edges in `src/agent/production-graph.ts`, and add `"team"` to the `chatRequestSchema` strategy enum in `src/controllers/chat-controller.ts`. Requests may select it explicitly (override) or the router may select it automatically.
- **Rationale**: The existing mechanism already supports both explicit override and automatic routing (`selectionSource: "override" | "auto"`). Adding `team` there satisfies FR-001 (selectable) and FR-001/SC-009 (unknown routes rejected) with no new transport.
- **Alternatives considered**: A separate `/team` endpoint. Rejected — it would duplicate chat/response/trace/persistence and fragment the UI flow; the spec requires the same response shape consumed by the existing chat and trace experiences.

## R5. Where `{next, brief}` and the blackboard contributions live

- **Decision**: `TeamBlackboard` is an in-memory structure scoped to a single `run()` invocation, holding an ordered list of `{ role, content, at }` entries plus the running brief/history. The supervisor prompt receives the blackboard summary; each role reads it and appends its contribution. Nothing is persisted beyond the run; only the trace (which includes handoff events) is persisted through the existing `RequestTraceService`.
- **Rationale**: Matches FR-002 (shared working state for the run) and the assumption that no long-term persistence is introduced. It keeps the domain pure and the IO boundary unchanged.
- **Alternatives considered**: Persisting the blackboard to SQLite. Rejected as out of scope and unnecessary; the trace is the audit surface.

## R6. The `handoff` trace event shape and web rendering

- **Decision**: Extend the backend `TraceEvent` with an optional `"handoff"` type and optional fields `from`, `to`, `brief`. The event's `content` carries a human-readable summary (`from → to: brief`), `node` is `"team"`. Extend the web `types/trace.ts` (`TRACE_EVENT_TYPES += "handoff"`, `TRACE_NODE_IDS += "team"`) and `TraceEventItem.tsx` (label `Handoff` plus a `de`/`para`/`brief` detail list). Unknown types remain preserved via the existing passthrough schema and fallback label.
- **Rationale**: The web trace schema already uses `.passthrough()` and renders unknown types with a fallback, and `request-trace-service` persists the full event payload as JSON — so adding optional fields requires no storage change and satisfies FR-009, FR-014 and FR-015.
- **Alternatives considered**: Encoding `from`/`to`/`brief` only inside `content` as untyped text. Rejected — structured fields are needed for accessible, precise rendering and to keep the handoff machine-readable.

## R7. What "best available answer / explicit incomplete" means at the ceiling

- **Decision**: When the ceiling is reached without a final supervisor `done`, the run returns either the last non-empty contribution/answer and marks the run as incomplete in the trace with a `handoff`/`answer` event explaining the ceiling was reached, or, if there is no usable content, it fails with a `DomainError`. It must never present the ceiling stop as a fully successful answer (FR-011, FR-012, SC-006, SC-007).
- **Rationale**: Makes the bounded end state observable and testable, consistent with the constitution's rule that unsuccessful operations are not presented as success.
- **Alternatives considered**: Silently returning the last message. Rejected — it would violate FR-012 and mislead operators.

## Dependencies & integration best practices

- **LangGraph structured output**: the router pattern (`withStructuredOutput` + `includeRaw` + `safeParse`, throwing `UNSUPPORTED_STRATEGY` on invalid output) is the proven integration point for the supervisor decision. Reuse it (R1).
- **Mutation safety**: all incident mutations flow through `invokeOpsTool` + `isMutationAuthorized`; team mode adds no new mutation path (R3, R4). Verified against `plan-and-execute.ts` and `mutation-policy.ts`.
- **Testing**: backend uses `node:test` + `assert/strict` with deterministic dependency injection (see `plan-and-execute.test.ts`); the team strategy must expose injectable supervisor/role dependencies for deterministic tests. Web uses Vitest with fixtures in `web/src/test/fixtures/index.ts`.
