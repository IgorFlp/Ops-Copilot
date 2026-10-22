import type { AlertStatus } from "../models/alert.js";
import type { IncidentSeverity, IncidentStatus } from "../models/incident.js";

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

export interface AlertRecord {
  id: number;
  fixtureKey: string;
  serviceId: number;
  service: string;
  title: string;
  description: string;
  status: AlertStatus;
}

export interface IncidentRecord {
  id: number;
  serviceId: number;
  service: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
}
