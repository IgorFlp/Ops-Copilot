# Implementation Plan: Unified Production Graph

**Branch**: `013-unified-production-graph` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-unified-production-graph/spec.md`

## Summary

Unify production chat strategy selection and execution in a per-request LangGraph graph at `src/agent/production-graph.ts`. A context node prepares the effective prompt once; an automatic router uses validated structured output (`route`, `reason`) to choose `react`, `plan-and-execute`, or `reflect:react`; and a conditional edge invokes exactly one response node. A supported explicit `/chat` strategy bypasses the router, and the legacy `reflect` flag without an explicit strategy selects `reflect:react`. Graph and pre-graph summary traces receive node attribution before the unchanged chat result is returned.

The intentional externally visible behavior change is that an omitted strategy (with reflection disabled) is now selected by the router instead of defaulting to `react`. Explicitly requested supported strategies remain deterministic.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22 LTS (minimum `22.13.0`)

**Primary Dependencies**: `@langchain/langgraph` 1.5.0, `@langchain/openai` 1.6.2, `@langchain/core` 1.2.17, Zod 4.6.7, Express. Versions are those resolved by the current lockfile; package manifests currently declare LangChain and Zod as `latest`.

**Storage**: Existing conversation and operational stores (SQLite); the graph uses per-invocation state only and adds no checkpointing or persistence.

**Testing**: `node:test` via `tsx`; run targeted graph/chat tests, then `npm run typecheck` and `npm test`.

**Target Platform**: Node.js service

**Project Type**: Backend web service with agent orchestration

**Performance Goals**: Automatic routing adds at most one model call; explicit strategy selection adds no router call. The whole chat graph remains under the existing 180-second `/chat` deadline.

**Constraints**:
- Keep history loading, summary maintenance, memory recall, persistence, and learning side effects in the existing chat service; the graph owns request-context assembly, strategy selection, and answer generation.
- Validate router output and fail explicitly on an unsupported route or blank reason; do not silently select a fallback strategy.
- Preserve direct `ReasoningStrategy` use by the arena and benchmark flows; add node attribution at the production-graph/chat boundary.
- Attribute summary trace events created before graph invocation when merging the final chat trace.
- Keep operational tool authorization and existing domain-error boundaries unchanged.
- `strategy` remains optional. Explicit supported values take precedence over routing; when it is omitted and `reflect` is true, preserve the specified reflected-ReAct behavior.

**Scale/Scope**: One chat request runs one graph invocation and at most one response strategy. No persistent graph state, new storage entities, or changes to arena/benchmark routing are in scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Assessment |
|---|---|---|
| I. Explicit MVC Layers | Pass | The graph is an orchestration component called by the chat service; HTTP parsing and response/error translation stay in the controller. No persistence or Express dependency is added to the graph. |
| II. Validated External Boundaries | Pass | `/chat` input remains Zod-validated; structured model output is schema-validated before it can select a graph edge. |
| III. Domain Errors | Pass | Unsupported explicit strategies and invalid router outputs fail explicitly and are translated by the existing HTTP boundary. |
| IV. Tested Changes | Pass | Add unit and chat integration tests; final implementation must pass typecheck and the test suite. |
| V. Security, Simplicity, and Spec-First Development | Pass | Reuse existing strategies/context/tool authorization, keep state per invocation, expose no secrets, and implement only after the specified workflow. |

No constitution violations or exceptions are required. Initial gate: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/013-unified-production-graph/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-api.yaml
└── tasks.md              # Created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
src/
├── agent/
│   ├── production-graph.ts
│   └── production-graph.test.ts
├── agents/
│   └── types.ts                    # Trace event type and node attribution
├── controllers/
│   └── chat-controller.ts          # Optional strategy request validation
└── services/
    └── chat-service.ts             # Invoke graph and merge attributed traces
```

**Structure Decision**: Keep graph construction beside the existing strategy registry in `src/agent/`. The chat service supplies conversation-specific inputs and owns surrounding side effects; the controller remains the external HTTP boundary. Update the versioned `/chat` contract alongside the new graph behavior. Test the graph independently and exercise the HTTP behavior through the existing chat-router test harness.

## Design Decisions

1. **One request-scoped graph, existing strategy implementations**: Build the context once in the graph and pass the same prepared strategy input to the router and one answer node. Reuse the registered ReAct and Plan-and-Execute strategies and the existing reflection decorator rather than reimplementing their tool loops.
2. **Automatic routing versus pinned selection**: A supported explicit `strategy` selects its answer node without invoking the router. Without `strategy`, `reflect: true` selects the reflected ReAct node for compatibility with the feature spec; otherwise, the router chooses among all three nodes. Record the selection source so a pinned route is not represented as a model decision.
3. **Structured route contract**: The router returns `route` from the exact supported identifier set and a trimmed, non-empty `reason`. A Zod schema constrains the response; a post-parse guard still rejects invalid values. The prompt presents a table of route identifiers and intended use.
4. **Trace attribution at the graph boundary**: Require a `node` on every returned trace event. Graph-created route events include the chosen route and reason. Tag strategy events with the selected response-node identifier, tag context events with `context`, and tag pre-graph summary events with `summary`. Preserve existing event fields and chat result metrics.
5. **Compatibility boundaries**: Keep low-level strategies usable by arena/bench without making them depend on graph state. The `/chat` omitted-strategy behavior changes intentionally from fixed ReAct to automatic routing; explicit supported strategy selection remains deterministic. Invalid explicit values retain the existing unsupported-strategy error path.

## Phase 0: Research Findings

See [research.md](./research.md). The repository already uses LangGraph `StateGraph` and Zod-backed `withStructuredOutput`; no additional runtime dependency or external service is needed.

## Phase 1: Design Artifacts

- [Data model](./data-model.md): request context, routing decision, graph state, and trace-node attribution.
- [Chat API contract](./contracts/chat-api.yaml): optional strategy override, supported route IDs, route trace metadata, and node attribution.
- [Quickstart](./quickstart.md): focused graph, chat, typecheck, and full test validation.

Post-design constitution check: PASS. The design keeps the graph stateless across requests, validates both external input and router output, preserves controller/service separation, and defines tests for the behavior and compatibility boundary.

## Complexity Tracking

No constitution violations or additional architectural layers are introduced.
