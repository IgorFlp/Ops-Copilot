// Trace Events Contract
// Extensions to existing trace event types for model resilience

import { TraceEvent, TraceEventType, AttributedTraceEvent, TraceNodeId } from "../../src/agents/types.js";

// Extended trace event type with "fallback"
export type ExtendedTraceEventType = TraceEventType | "fallback";

// Fallback trace event emitted when switching models
export interface FallbackTraceEvent extends TraceEvent {
  type: "fallback";
  fromModel: string;
  toModel: string;
  reason: FallbackReason;
  attemptSummary: ModelAttemptSummary;
}

export type FallbackReason = 
  | "retry_exhausted"
  | "non_retryable_error"
  | "invalid_model"
  | "configuration_error";

export interface ModelAttemptSummary {
  totalAttempts: number;
  lastError: ModelAttemptError | null;
  totalLatencyMs: number;
}

export interface ModelAttemptError {
  name: string;
  message: string;
  statusCode?: number;
  code?: string;
}

// Attributed fallback event (with node context)
export interface AttributedFallbackTraceEvent extends FallbackTraceEvent {
  node: TraceNodeId;
}

// Type guard for fallback events
export function isFallbackTraceEvent(event: TraceEvent): event is FallbackTraceEvent {
  return event.type === "fallback";
}

// Extended metrics with resilience data
export interface ExtendedModelTokenUsage {
  modelCalls: number;
  promptTokens?: number;
  modelUsed?: string;
  fallbackCount?: number;
  totalLatencyMs?: number;
}

// Extended reasoning result with resilience metrics
export interface ExtendedReasoningResult {
  answer: string;
  trace: TraceEvent[];
  metrics: {
    calls: number;
    latencyMs: number;
  };
  tokenUsage?: ExtendedModelTokenUsage;
}

// Trace event factory for creating fallback events
export function createFallbackTraceEvent(
  fromModel: string,
  toModel: string,
  reason: FallbackReason,
  attemptSummary: ModelAttemptSummary
): FallbackTraceEvent {
  return {
    type: "fallback",
    content: `Fallback from ${fromModel} to ${toModel}: ${reason}`,
    timestamp: new Date().toISOString(),
    fromModel,
    toModel,
    reason,
    attemptSummary
  };
}