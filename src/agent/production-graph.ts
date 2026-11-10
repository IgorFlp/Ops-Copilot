import { z } from "zod";
import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createModel, createResilientModel } from "../agents/model.js";
import { extractPromptTokens, combineModelUsage } from "../agents/model-usage.js";
import type { ReasoningStrategy } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";
import type {
  GraphState,
  RouteDecision,
  StrategyId,
  SelectionSource,
  AttributedTraceEvent,
  ChatStrategyInput,
  FallbackTraceEvent,
} from "../agents/types.js";
import { strategyRegistry } from "./index.js";
import { withReflection } from "../agents/reflection.js";

const routeSchema = z.object({
  route: z.enum(["react", "plan-and-execute", "reflect:react"]),
  reason: z.string().min(1, "Reason must not be empty"),
});

type RouteSchema = z.infer<typeof routeSchema>;

const ROUTER_SYSTEM_PROMPT = `You are an operations assistant router. Your job is to analyze the user's request and select the most appropriate response strategy.

Available strategies:
| Route | Identifier | Intended Use |
|-------|------------|--------------|
| ReAct | react | Single-step lookup or simple operational queries using tools directly |
| Plan-and-Execute | plan-and-execute | Multi-step operational tasks requiring explicit planning, sequencing, or incident mutation |
| ReAct with Reflection | reflect:react | Complex analysis requiring self-critique and iterative refinement of the answer |

Return a JSON object with exactly two fields:
- "route": one of "react", "plan-and-execute", "reflect:react"
- "reason": a brief explanation for your choice (minimum 1 character)`;

function createAttributedEvent(
  node: AttributedTraceEvent["node"],
  type: AttributedTraceEvent["type"],
  content: string,
  extra?: Partial<AttributedTraceEvent>,
): AttributedTraceEvent {
  return {
    node,
    type,
    content,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

async function contextNode(state: GraphState): Promise<Partial<GraphState>> {
  const { input } = state;
  const prompt = input.message;

  const traceEvent = createAttributedEvent(
    "context",
    "context",
    `Prepared context for routing and strategy execution. User message: ${prompt.slice(0, 200)}${prompt.length > 200 ? "..." : ""}`,
  );

  return {
    trace: [traceEvent],
  };
}

async function routerNode(state: GraphState): Promise<Partial<GraphState>> {
  const { input } = state;

  const router = createModel().withStructuredOutput(routeSchema, {
    includeRaw: true,
  });

  const messages = [
    new SystemMessage(ROUTER_SYSTEM_PROMPT),
    new HumanMessage(input.message),
  ];

  const result = await router.invoke(messages);

  const parsed = routeSchema.safeParse(result.parsed ?? result.raw);

  if (!parsed.success) {
    throw new DomainError(
      `Router returned invalid structured output: ${parsed.error.message}`,
      "UNSUPPORTED_STRATEGY",
    );
  }

  const routeDecision: RouteDecision = {
    route: parsed.data.route,
    reason: parsed.data.reason.trim(),
  };

  if (!routeDecision.reason) {
    throw new DomainError("Router returned empty reason", "UNSUPPORTED_STRATEGY");
  }

  const routeEvent = createAttributedEvent(
    "route",
    "route",
    JSON.stringify({ route: routeDecision.route, reason: routeDecision.reason }),
  );

  const rawMessage = result.raw as { usage_metadata?: { prompt_tokens?: number } } | undefined;
  const tokenUsage = rawMessage?.usage_metadata
    ? { modelCalls: 1, promptTokens: rawMessage.usage_metadata.prompt_tokens }
    : undefined;

  return {
    route: routeDecision,
    selectedStrategy: routeDecision.route,
    selectionSource: "auto",
    trace: [routeEvent],
    metrics: {
      calls: 1,
      latencyMs: 0,
      tokenUsage,
    },
  };
}

async function overrideNode(state: GraphState): Promise<Partial<GraphState>> {
  const { selectedStrategy, selectionSource } = state;
  const strategy = selectedStrategy!;
  const reason = selectionSource === "override"
    ? `Explicit override: ${strategy}`
    : `Legacy reflect flag enabled`;

  const routeEvent = createAttributedEvent(
    "route",
    "route",
    JSON.stringify({ route: strategy, reason }),
  );

  return {
    selectedStrategy: strategy,
    trace: [routeEvent],
  };
}

async function createStrategyNode(
  strategy: ReasoningStrategy,
  strategyId: StrategyId,
): Promise<(state: GraphState) => Promise<Partial<GraphState>>> {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    const { input } = state;
    const started = Date.now();

    const result = await strategy.run(input);

    const attributedTrace: AttributedTraceEvent[] = result.trace.map((event) =>
      createAttributedEvent(strategyId, event.type, event.content, {
        tools: event.tools,
        args: event.args,
        approved: event.approved,
        timestamp: event.timestamp,
      }),
    );

    const strategyEvent = createAttributedEvent(
      strategyId,
      "answer",
      result.answer,
    );

    return {
      strategyResult: result,
      trace: [...attributedTrace, strategyEvent],
      metrics: {
        calls: result.metrics.calls,
        latencyMs: Date.now() - started,
        tokenUsage: result.tokenUsage,
      },
    };
  };
}

function combineMetrics(
  current: GraphState["metrics"],
  incoming: GraphState["metrics"],
): GraphState["metrics"] {
  return {
    calls: current.calls + incoming.calls,
    latencyMs: current.latencyMs + incoming.latencyMs,
    tokenUsage: combineModelUsage(current.tokenUsage, incoming.tokenUsage),
  };
}

const GraphStateAnnotation = Annotation.Root({
  input: Annotation<ChatStrategyInput>(),
  route: Annotation<RouteDecision | undefined>(),
  selectedStrategy: Annotation<StrategyId | undefined>(),
  selectionSource: Annotation<SelectionSource | undefined>(),
  strategyResult: Annotation<GraphState["strategyResult"]>(),
  trace: Annotation<AttributedTraceEvent[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  metrics: Annotation<GraphState["metrics"]>({
    reducer: (current, update) => combineMetrics(current, update),
    default: () => ({ calls: 0, latencyMs: 0, tokenUsage: undefined }),
  }),
});

type CompiledGraph = any;

async function createGraph(
  strategies?: Map<StrategyId, ReasoningStrategy>,
): Promise<CompiledGraph> {
  const reactStrategy = strategies?.get("react") ?? strategyRegistry.getStrategy("react")!;
  const planAndExecuteStrategy = strategies?.get("plan-and-execute") ?? strategyRegistry.getStrategy("plan-and-execute")!;
  const baseReactStrategy = strategies?.get("react") ?? strategyRegistry.getStrategy("react")!;
  const reflectReactStrategy = strategies?.get("reflect:react") ?? withReflection(baseReactStrategy);

  const reactNode = await createStrategyNode(reactStrategy, "react");
  const planExecuteNode = await createStrategyNode(planAndExecuteStrategy, "plan-and-execute");
  const reflectNode = await createStrategyNode(reflectReactStrategy, "reflect:react");

  const graph = new StateGraph(GraphStateAnnotation)
    .addNode("contexto", contextNode)
    .addNode("roteador", routerNode)
    .addNode("override", overrideNode)
    .addNode("react", reactNode)
    .addNode("planExecute", planExecuteNode)
    .addNode("reflect", reflectNode)
    .addEdge(START, "contexto")
    .addConditionalEdges(
      "contexto",
      (state) => {
        if (state.selectionSource === "override" || state.selectionSource === "reflect") {
          return "override";
        }
        return "roteador";
      },
      {
        override: "override",
        roteador: "roteador",
      },
    )
    .addConditionalEdges(
      "override",
      (state) => state.selectedStrategy!,
      {
        react: "react",
        "plan-and-execute": "planExecute",
        "reflect:react": "reflect",
      },
    )
    .addConditionalEdges(
      "roteador",
      (state) => state.route!.route,
      {
        react: "react",
        "plan-and-execute": "planExecute",
        "reflect:react": "reflect",
      },
    )
    .addEdge("react", END)
    .addEdge("planExecute", END)
    .addEdge("reflect", END)
    .compile();

  return graph;
}

export async function createProductionGraph(
  strategies?: Map<StrategyId, ReasoningStrategy>,
): Promise<CompiledGraph> {
  return createGraph(strategies);
}

export type ProductionGraph = CompiledGraph;