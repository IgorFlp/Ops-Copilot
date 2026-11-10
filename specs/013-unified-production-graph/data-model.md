# Data Model: Unified Production Graph

## Entities

### 1. GraphState
The per-invocation state for the production graph.

```typescript
interface GraphState {
  // Prepared request context (built once in ChatService, passed to graph)
  input: ChatStrategyInput;

  // Routing decision (populated by router node, or set directly for override)
  route?: RouteDecision;

  // Selected strategy identifier (react | plan-and-execute | reflect:react)
  selectedStrategy?: StrategyId;

  // Source of selection: "auto" (router) | "override" (explicit strategy) | "reflect" (legacy flag)
  selectionSource?: "auto" | "override" | "reflect";

  // Result from the executed strategy node
  strategyResult?: ReasoningResult;

  // Accumulated trace events with node attribution
  trace: AttributedTraceEvent[];

  // Aggregated metrics
  metrics: {
    calls: number;
    latencyMs: number;
    tokenUsage?: ModelTokenUsage;
  };
}
```

**Fields**:
- `input`: The prepared `ChatStrategyInput` containing user message, history, summary, memories, and userId.
- `route`: Present only when router runs (automatic routing). Contains the selected route and reason.
- `selectedStrategy`: The strategy identifier that will execute or has executed.
- `selectionSource`: Distinguishes automatic routing (`auto`) from explicit override (`override`) and legacy `reflect` flag (`reflect`).
- `strategyResult`: The `ReasoningResult` from the executed strategy node.
- `trace`: All events produced during graph execution, each with `node` attribution.
- `metrics`: Aggregated calls, latency, and token usage across router and strategy.

**Validation Rules**:
- `input` must be present at graph entry (validated by `ChatService`).
- Exactly one of `route` (auto) or `selectionSource === "override" | "reflect"` must be set before strategy node.
- `selectedStrategy` must be one of `react`, `plan-and-execute`, `reflect:react`.
- `trace` events must all have a non-empty `node` field.

**State Transitions**:
```
ENTRY → context node (prepare trace) → router node (if auto) → strategy node → EXIT
                ↑                              ↑
                └── override/reflect ──────────┘
```

---

### 2. RouteDecision
The router's structured output.

```typescript
interface RouteDecision {
  route: StrategyId;           // "react" | "plan-and-execute" | "reflect:react"
  reason: string;              // Non-empty explanation for the choice
}
```

**Fields**:
- `route`: Must be exactly one of the three supported strategy identifiers.
- `reason`: Human-readable justification; must not be empty or whitespace-only.

**Validation Rules** (enforced by Zod schema + post-parse guard):
- `route ∈ {"react", "plan-and-execute", "reflect:react"}`
- `reason.trim().length > 0`
- Failure throws `DomainError("UNSUPPORTED_STRATEGY")` — no fallback.

---

### 3. ChatStrategyInput (existing, reused)
Prepared context passed to both router and strategy nodes.

```typescript
interface ChatStrategyInput {
  userId?: string;
  message: string;
  conversationSummary?: string;
  history: StrategyHistoryMessage[];
  memoryFacts?: string[];
  memoryEntries?: MemoryEntry[];
}
```

**Fields**: See `src/agents/types.ts`. Built by `ChatService` using `context-builder`.

**Validation Rules**:
- `message` must be non-empty.
- `history` is an array of `{ role, content }` messages.
- `memoryEntries` include `fact` and `score`.

---

### 4. StrategyId (type)
```typescript
type StrategyId = "react" | "plan-and-execute" | "reflect:react";
```

**Values**:
- `react`: ReAct agent with operational tools.
- `plan-and-execute`: Planner → Executor → Replanner loop.
- `reflect:react`: ReAct wrapped with reflection critic loop.

---

### 5. AttributedTraceEvent
Extension of existing `TraceEvent` with mandatory `node` attribution.

```typescript
interface AttributedTraceEvent extends TraceEvent {
  node: TraceNodeId;
}
```

**Fields**:
- All fields from `TraceEvent` (`type`, `content`, `timestamp`, `tools`, `args`, `approved`).
- `node`: Identifies the graph node that produced this event.

**TraceNodeId values**:
| Node ID | Source |
|---|---|
| `context` | Context preparation (prompt assembly) |
| `route` | Router decision event |
| `react` | ReAct strategy execution |
| `plan-and-execute` | Plan-and-Execute strategy execution |
| `reflect:react` | Reflected ReAct strategy execution |
| `summary` | Pre-graph conversation summarization (added by ChatService) |

**Validation Rules**:
- Every event in the final chat trace MUST have a `node` value.
- `summary` events are added by `ChatService` when merging `summaryEvents`.
- `route` event includes `route` and `reason` in its content.

**Route Event Shape**:
```typescript
{
  type: "route",
  content: JSON.stringify({ route: "plan-and-execute", reason: "..." }),
  node: "route",
  timestamp: "..."
}
```

---

### 6. ReasoningResult (existing, reused)
Output from each strategy node.

```typescript
interface ReasoningResult {
  answer: string;
  trace: TraceEvent[];           // Internal trace (without node)
  metrics: ReasoningMetrics;
  tokenUsage?: ModelTokenUsage;
}
```

**Note**: The graph adds `node` attribution to each trace event when merging into `GraphState.trace`.

---

### 7. ModelTokenUsage (existing)
```typescript
interface ModelTokenUsage {
  modelCalls: number;
  promptTokens?: number;
}
```

---

## Relationships

```
ChatService
  └─ prepares → ChatStrategyInput
       └─ passed to → ProductionGraph
            ├─ context node → adds AttributedTraceEvent[node="context"]
            ├─ router node (if auto) → RouteDecision → AttributedTraceEvent[node="route"]
            │    └─ sets selectedStrategy, selectionSource="auto"
            ├─ override/reflect → sets selectedStrategy, selectionSource="override|reflect"
            └─ strategy node (one of three) → ReasoningResult
                 └─ maps trace[] → AttributedTraceEvent[node=selectedStrategy]
            └─ returns GraphState with merged trace + metrics
  └─ merges summaryEvents → AttributedTraceEvent[node="summary"]
  └─ returns ChatServiceResult
```

---

## State Machine: Graph Execution

```
START
  │
  ▼
┌─────────────────────┐
│ context node        │  ← builds prompt, emits trace event (node="context")
└─────────┬───────────┘
          │
          ▼
    ┌─────────────┐
    │ strategy    │
    │ provided?   │
    └──────┬──────┘
     yes   │   no
     ▼     ▼
┌────────┐  ┌─────────────┐
│ override│  │ router node │  ← withStructuredOutput, emits route event
│ path   │  └──────┬──────┘
└────┬───┘         │
     │             ▼
     │      ┌─────────────┐
     │      │ valid route?│
     │      └──────┬──────┘
     │       no  │  yes
     │       ▼   ▼
     │  ┌───────┐  ┌──────────────────┐
     │  │ throw │  │ conditional edge │
     │  │ error │  └────────┬─────────┘
     │  └───────┘           │
     └───────────┬──────────┘
                 ▼
      ┌─────────────────────┐
      │ strategy node       │  ← invokes selected strategy.run(input)
      │ (react | plan-and-  │
      │  execute | reflect) │
      └──────────┬──────────┘
                 │
                 ▼
      ┌─────────────────────┐
      │ attach node to all  │
      │ strategy trace      │
      │ events              │
      └──────────┬──────────┘
                 │
                 ▼
      ┌─────────────────────┐
      │ aggregate metrics   │
      └──────────┬──────────┘
                 │
                 ▼
               END
```

---

## Error States

| Condition | Error Code | HTTP Status | Handling |
|---|---|---|---|
| Unsupported explicit `strategy` | `UNSUPPORTED_STRATEGY` | 400 | `strategyRegistry.resolve` throws; controller catches |
| Router returns invalid route | `UNSUPPORTED_STRATEGY` | 500 | Post-parse guard in router node throws |
| Router returns empty reason | `UNSUPPORTED_STRATEGY` | 500 | Post-parse guard throws |
| Strategy execution fails | `INTERNAL` | 500 | `ChatService` catches, logs, re-throws as `DomainError` |
| Context preparation fails | `INTERNAL` | 500 | Existing `ChatService` error handling |

---

## Backward Compatibility

- `strategy` remains optional in `/chat` request.
- Omitting `strategy` now triggers automatic routing (was fixed `react`).
- `reflect: true` without `strategy` → `reflect:react` (existing behavior).
- Explicit `strategy` values (`react`, `plan-and-execute`, `reflect:react`) are deterministic.
- `ChatServiceResult` shape unchanged: `answer`, `trace[]`, `metrics`, `conversationId`.
- Arena/benchmark flows use `ReasoningStrategy` directly; unaffected.