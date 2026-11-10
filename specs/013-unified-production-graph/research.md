# Research: Unified Production Graph

## Context
This feature introduces a unified production graph (`src/agent/production-graph.ts`) that consolidates context preparation, automatic strategy routing, and response strategy execution into a single per-request LangGraph invocation. The graph replaces the existing fixed-strategy selection in `ChatService` with an automatic router that chooses among `react`, `plan-and-execute`, and `reflect:react`.

## Decisions

### 1. Graph State and Node Design
**Decision**: Use LangGraph `StateGraph` with a single request-scoped state containing the prepared context, routing decision, and the selected strategy's result.

**Rationale**: 
- The existing strategies (`reactStrategy`, `planAndExecuteStrategy`, `reflect:react` via `withReflection`) are already LangGraph-compatible and produce `ReasoningResult` with traces.
- A single graph invocation keeps the flow atomic and simplifies trace merging.
- The graph owns only the per-request state: context assembly, routing, and answer generation. Conversation persistence, summary maintenance, and learning side effects remain in `ChatService`.

**Alternatives considered**:
- Separate graphs for routing and execution: adds complexity and latency.
- Router as a standalone function called from `ChatService`: loses the unified trace and node attribution.

### 2. Structured Router Output with `withStructuredOutput`
**Decision**: Use `@langchain/core` model's `withStructuredOutput` with a Zod schema `{ route: z.enum([...]), reason: z.string().min(1) }` and `includeRaw: true` for validation and token usage capture.

**Rationale**:
- The codebase already uses this pattern in `plan-and-execute.ts` (planner, executor, replanner) and `reflection.ts` (critic).
- Zod schema ensures the route is exactly one of the three supported identifiers and reason is non-empty.
- `includeRaw: true` captures token usage for metrics without extra model calls.
- Post-parse guard rejects invalid values per FR-007.

**Alternatives considered**:
- Free-form prompt parsing: error-prone, no schema enforcement.
- Function calling with tools: overkill for a single routing decision.

### 3. Route Selection Table in Prompt
**Decision**: Embed a markdown table in the router system prompt listing all three routes with their intended use cases.

**Rationale**:
- FR-004 requires the router's guidance to distinguish all three choices.
- Table format is concise and model-readable.
- Mirrors the existing pattern of detailed system prompts in `plan-and-execute.ts`.

**Alternatives considered**:
- Prose description only: less structured, harder for model to parse.
- Separate few-shot examples: increases prompt length without clear benefit.

### 4. Explicit Strategy Override Behavior
**Decision**: When `strategy` is provided in the request, bypass the router entirely and invoke the corresponding strategy node directly. Record the selection source (`override` vs `auto`) in the trace.

**Rationale**:
- FR-006 and FR-010 require explicit overrides to be traceable and not implied as router decisions.
- Matches the existing `strategyRegistry.resolve` behavior for named strategies.
- `reflect: true` without `strategy` maps to `reflect:react` for backward compatibility (FR-012).

**Alternatives considered**:
- Still invoke router but force its output: adds unnecessary model call and obscures trace.
- Validate override in controller, then pass a flag to graph: splits logic across layers.

### 5. Trace Node Attribution
**Decision**: Every trace event returned by the graph includes a `node` field identifying its origin: `context`, `route`, `react`, `plan-and-execute`, or `reflect:react`. Pre-graph summary events are tagged with `summary` by `ChatService` when merging.

**Rationale**:
- FR-009 and FR-011 require node attribution on all events without changing existing chat result fields.
- Graph-internal events (route decision, strategy traces) are tagged at source.
- `ChatService` already merges `summaryEvents` before strategy trace; it will add `node: "summary"` to those.

**Alternatives considered**:
- Add `node` only to new events: breaks SC-002 (100% of events).
- Modify `TraceEvent` type to require `node`: breaking change for arena/bench consumers.

### 6. Invalid Router Output Handling
**Decision**: If the router returns an unsupported route or empty reason, throw a `DomainError` with code `UNSUPPORTED_STRATEGY` (reusing existing error code). Do not fall back.

**Rationale**:
- FR-007 and edge case: explicit failure over silent fallback.
- Existing HTTP boundary in `chat-controller.ts` already handles `UNSUPPORTED_STRATEGY`.
- Consistent with `strategyRegistry.resolve` behavior for unknown strategies.

**Alternatives considered**:
- Default to `react`: violates explicit failure requirement.
- Retry router: adds latency and complexity; model should produce valid output on first try with schema.

### 7. Graph Integration with ChatService
**Decision**: `ChatService.runChat` prepares conversation context (history, summary, memories) once, builds the `ChatStrategyInput`, then invokes the production graph with that input. The graph returns the answer, trace, and metrics; `ChatService` merges summary events, appends to conversation, and returns the existing `ChatServiceResult` shape.

**Rationale**:
- Keeps context preparation, persistence, learning, and summary logic in `ChatService` (per constraint).
- Graph is a pure orchestration component with no side effects.
- Preserves `ChatServiceResult` interface for controller compatibility.

**Alternatives considered**:
- Move all chat logic into graph: violates MVC separation (Principle I).
- Graph calls back to service for persistence: introduces cyclic dependency.

## Dependencies and Best Practices

### LangGraph StateGraph Patterns
- Use `Annotation.Root` for typed state with reducers (as in `plan-and-execute.ts`).
- Compile with appropriate `recursionLimit` (max iterations × steps + buffer).
- Conditional edges for router-to-strategy dispatch.

### Structured Output Validation
- Use Zod schema with `.strict()` for exact field matching.
- Parse with `safeParse` and throw on failure (pattern from `plan-and-execute.ts`).
- Capture token usage via `includeRaw: true` and `extractPromptTokens`.

### Strategy Reuse
- Existing strategies implement `ReasoningStrategy` interface.
- `withReflection` decorator wraps any strategy to add reflection loop.
- Graph nodes invoke `strategy.run(input)` directly, passing the same `ChatStrategyInput`.

## Open Questions Resolved
| Question | Resolution |
|---|---|
| Where does context preparation live? | In `ChatService` before graph invocation; graph receives prepared `ChatStrategyInput`. |
| How does router distinguish strategies? | System prompt with route table; structured output schema constrains values. |
| What happens to `reflect` flag? | Without `strategy`, `reflect: true` → `reflect:react` node. With `strategy`, `strategy` wins. |
| How are summary events attributed? | `ChatService` adds `node: "summary"` when merging `summaryEvents` into final trace. |
| Does graph persist state? | No checkpointing; per-invocation state only. |
| How to test router in isolation? | Export router node factory; test with mocked model returning known routes. |

## Summary of Key Artifacts to Produce
1. **data-model.md**: Graph state, route decision, strategy input, trace event with node.
2. **contracts/chat-api.yaml**: `/chat` request/response with optional `strategy`, trace event schema with `node`, route event schema.
3. **quickstart.md**: Commands to run graph tests, chat tests, typecheck, and full suite.