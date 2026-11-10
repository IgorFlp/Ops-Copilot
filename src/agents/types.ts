import type {
  AlertRecord,
  IncidentRecord,
  IncidentSeverity,
} from "../store/ops-store.js";
import type {
  AlertSeverity,
  AlertStatus,
  IncidentStatus,
} from "../store/ops-store.js";
import { buildContext, type MemoryEntry } from "../context/context-builder.js";

export type { AlertRecord, IncidentRecord } from "../store/ops-store.js";

export type TraceEventType =
  | "thought"
  | "action"
  | "observation"
  | "plan"
  | "critique"
  | "answer"
  | "summarize"
  | "route"
  | "context"
  | "fallback";

export interface TraceEvent {
  type: TraceEventType;
  content: string;
  timestamp?: string;
  tools?: string[];
  args?: Record<string, unknown>;
  approved?: boolean;
}

export type TraceNodeId =
  | "context"
  | "route"
  | "react"
  | "plan-and-execute"
  | "reflect:react"
  | "summary";

export interface AttributedTraceEvent extends TraceEvent {
  node: TraceNodeId;
}

export type FallbackReason =
  | "retry_exhausted"
  | "non_retryable_error"
  | "invalid_model"
  | "configuration_error";

export interface ModelAttemptSummary {
  totalAttempts: number;
  lastError: ModelAttemptError | null | undefined;
  totalLatencyMs: number;
}

export interface ModelAttemptError {
  name: string;
  message: string;
  statusCode?: number;
  code?: string;
}

export interface FallbackTraceEvent extends TraceEvent {
  type: "fallback";
  fromModel: string;
  toModel: string;
  reason: FallbackReason;
  attemptSummary: ModelAttemptSummary;
}

export type StrategyId = "react" | "plan-and-execute" | "reflect:react";

export interface RouteDecision {
  route: StrategyId;
  reason: string;
}

export type SelectionSource = "auto" | "override" | "reflect";

export interface GraphState {
  input: ChatStrategyInput;
  route?: RouteDecision;
  selectedStrategy?: StrategyId;
  selectionSource?: SelectionSource;
  strategyResult?: ReasoningResult;
  trace: AttributedTraceEvent[];
  metrics: {
    calls: number;
    latencyMs: number;
    tokenUsage?: ModelTokenUsage;
  };
}

export interface ReasoningMetrics {
  calls: number;
  latencyMs: number;
}

export interface ModelTokenUsage {
  modelCalls: number;
  promptTokens?: number;
  modelUsed?: string;
  fallbackCount?: number;
  totalLatencyMs?: number;
}

export interface ReasoningResult {
  answer: string;
  trace: TraceEvent[];
  metrics: ReasoningMetrics;
  tokenUsage?: ModelTokenUsage;
}

export interface StrategyHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatStrategyInput {
  userId?: string;
  message: string;
  conversationSummary?: string;
  history: StrategyHistoryMessage[];
  memoryFacts?: string[];
  memoryEntries?: MemoryEntry[];
}

export type StrategyInput = string | ChatStrategyInput;

export function formatStrategyInput(input: StrategyInput): string {
  if (typeof input === "string") return input;
  const memories: MemoryEntry[] = input.memoryEntries?.length
    ? input.memoryEntries
    : (input.memoryFacts ?? []).map((fact, index, all) => ({
        fact,
        score: all.length - index,
      }));
  return buildContext({
    summary: input.conversationSummary ?? null,
    history: input.history,
    memories,
    userMessage: input.message,
  }).prompt;
}

export interface StrategyRunOptions {
  maxIterations?: number;
  maxReflection?: number;
  reflectionContext?: ReflectionContext;
  noReplanner?: boolean;
}

export interface ReflectionAction {
  tool: string;
  args: Record<string, unknown>;
  observation: string;
}

export interface ReflectionContext {
  feedback: string[];
  observations: string[];
  completedActions: ReflectionAction[];
}

export interface ReasoningStrategy {
  name: string;
  run(input: StrategyInput, options?: StrategyRunOptions): Promise<ReasoningResult>;
}

export type { AlertSeverity, AlertStatus, IncidentSeverity, IncidentStatus };
