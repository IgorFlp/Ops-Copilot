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

export type { AlertRecord, IncidentRecord } from "../store/ops-store.js";

export type TraceEventType =
  | "thought"
  | "action"
  | "observation"
  | "plan"
  | "critique"
  | "answer";

export interface TraceEvent {
  type: TraceEventType;
  content: string;
  timestamp?: string;
  tools?: string[];
  args?: Record<string, unknown>;
  approved?: boolean;
}

export interface ReasoningMetrics {
  calls: number;
  latencyMs: number;
}

export interface ReasoningResult {
  answer: string;
  trace: TraceEvent[];
  metrics: ReasoningMetrics;
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
  run(input: string, options?: StrategyRunOptions): Promise<ReasoningResult>;
}

export type { AlertSeverity, AlertStatus, IncidentSeverity, IncidentStatus };
