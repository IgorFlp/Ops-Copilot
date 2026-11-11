# Implementation Plan: Team Mode

**Branch**: `017-team-mode` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-team-mode/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a new reasoning route, `team`, in which a supervisor coordinates three specialized roles over a shared in-memory blackboard. The supervisor produces a structured decision `{next, brief}` each step, engages the Analyst (read-only: it may read, but it never proposes nor executes), the Planner (no tools) or the Executor (incident operations under the existing authorization policy, with no bypass), and records a `handoff` trace event for every control transfer. The run is bounded to eight handoffs. The route reuses the existing chat/response contract and the existing trace persistence, so the web "Ver raciocínio" panel renders the new handoff events without a new response shape.

## Technical Context

**Language/Version**: TypeScript ESM (strict), Node.js 22 LTS

**Primary Dependencies**: LangChain LangGraph (`@langchain/langgraph`), `@langchain/core`, `@langchain/openai` (OpenRouter), Zod, Express; web: Vite + React + TypeScript

**Storage**: SQLite via the native `node:sqlite` module; team runs persist through the existing request/trace store. The blackboard is in-memory and scoped to a single run.

**Testing**: Backend `node:test` via `tsx` (`npm test`, `npm run typecheck`); web Vitest (`npm --prefix web run test`, `npm --prefix web run typecheck`)

**Target Platform**: Node.js server (HTTP API) plus the browser SPA served under `/opspilot/`

**Project Type**: Web service (backend `src/`) with a separate web application (`web/`)

**Performance Goals**: A team run MUST complete within the existing chat deadline (180s, `DEFAULT_CHAT_TIMEOUT_MS`); the eight-handoff ceiling caps the number of model calls.

**Constraints**: Maximum of 8 handoffs per run (fixed default); Analyst read-only, Planner tool-free, Executor mutations only under the existing `isMutationAuthorized` policy with no bypass; no new chat response shape.

**Scale/Scope**: One new route (`team`), one supervisor, three roles, one new trace event type (`handoff`), one extended trace-rendering path in the web app.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Explicit MVC Layers**: PASS — the team coordinator lives in the domain (`src/team/`), reuse of operational tools goes through `src/agents/tools.ts` and `src/services/incident-service.ts`, HTTP wiring stays in `src/controllers/chat-controller.ts` and `src/routes`. The domain does not perform IO directly; it calls services.
- **II. Validated External Boundaries**: PASS — the new route value is added to the existing Zod `chatRequestSchema` enum; the supervisor decision is validated with a Zod schema via `withStructuredOutput` + `safeParse`, matching `production-graph.ts`.
- **III. Domain Errors**: PASS — invalid supervisor decisions, unknown roles, over-ceiling runs and role failures surface as `DomainError`s; no internal detail is exposed externally.
- **IV. Tested Changes**: PASS — new logic is covered with `node:test` via `tsx`; `npm run typecheck` and `npm test` must pass, plus web typecheck/tests.
- **V. Security, Simplicity, and Spec-First Development**: PASS — no secrets; the team route does not bypass the mutation authorization policy (it reuses `isMutationAuthorized` and `invokeOpsTool`); the feature follows `/speckit-specify` →`/speckit-plan`→`/speckit-tasks`→`/speckit-implement`.

**Post-Phase 1 re-check**: PASS — the design adds no IO to the domain, keeps validation at the boundary, and introduces no bypass path. No violations to track.

## Project Structure

### Documentation (this feature)

```text
specs/017-team-mode/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── team-route.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── team/                          # NEW: team-mode coordinator (domain)
│   ├── types.ts                   #   TeamRoleId, SupervisorDecision, HandoffEvent, TeamBlackboard
│   ├── blackboard.ts              #   Shared in-memory state for a single run
│   ├── supervisor.ts              #   withStructuredOutput({next, brief}) + ceiling
│   ├── roles.ts                   #   Analista, Planejador, Executor boundaries
│   └── team-strategy.ts           #   ReasoningStrategy named "team"
├── agents/
│   ├── types.ts                   # EXTEND: TraceEventType += "handoff"; TraceNodeId += "team"; TeamRoleId
│   ├── tools.ts                   # REUSE: read-only + mutation tools, invokeOpsTool
│   ├── mutation-policy.ts         # REUSE: isMutationAuthorized (no bypass)
│   └── model.ts                   # REUSE: createModel()
├── agent/
│   ├── index.ts                   # EXTEND: register "team" in StrategyId + registry
│   └── production-graph.ts        # EXTEND: route enum/edges support "team"
├── controllers/
│   └── chat-controller.ts         # EXTEND: chatRequestSchema strategy enum += "team"
└── services/
    ├── chat-service.ts            # REUSE (no change): unchanged response shape
    └── request-trace-service.ts   # REUSE: handoff events persist via existing trace

web/
└── src/
    ├── types/
    │   ├── trace.ts               # EXTEND: TRACE_EVENT_TYPES += "handoff"; TRACE_NODE_IDS += "team"
    │   └── chat.ts                # EXTEND: STRATEGIES += "team"
    └── components/trace/
        └── TraceEventItem.tsx     # EXTEND: label "Handoff" + from/to/brief details
```

**Structure Decision**: Single backend project at the repository root (`src/`) with the existing separate web application (`web/`). Team mode is a new domain module `src/team/`, registered as a first-class reasoning route alongside `react` and `plan-and-execute`. No new project or package is introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
