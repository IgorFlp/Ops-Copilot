// Model Factory Contract
// Internal interface for model creation with resilience

import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, AIMessage } from "@langchain/core/messages";

// Configuration for creating a model instance
export interface ModelOptions {
  maxTokens?: number;
  temperature?: number;  // Default: 0
}

// Primary model factory - creates single model instance
export interface ModelFactory {
  createModel(options?: ModelOptions): ChatOpenAI;
}

// Resilient model factory - creates model with retry/fallback chain
export interface ResilientModelFactory {
  createResilientModel(options?: ModelOptions): ResilientModel;
  getConfiguration(): ModelConfiguration;
}

// Resilient model wrapper with invoke method
export interface ResilientModel {
  invoke(input: string | BaseMessage[]): Promise<ResilientModelResult>;
  invokeWithTrace(
    input: string | BaseMessage[],
    trace: ResilientTraceEvent[]
  ): Promise<ResilientModelResult>;
}

// Result from resilient model invocation
export interface ResilientModelResult {
  content: string;
  modelUsed: string;
  fallbackCount: number;
  totalLatencyMs: number;
  attempts: ModelAttempt[];
  traceEvents: ResilientTraceEvent[];
}

// Individual model attempt record
export interface ModelAttempt {
  modelId: string;
  attemptNumber: number;
  startTime: string;
  endTime?: string;
  latencyMs?: number;
  success: boolean;
  error?: ModelAttemptError;
  retryable: boolean;
}

export interface ModelAttemptError {
  name: string;
  message: string;
  statusCode?: number;
  code?: string;
}

// Trace event for resilience (extends base trace)
export interface ResilientTraceEvent {
  type: "fallback";
  timestamp: string;
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

// Complete model configuration
export interface ModelConfiguration {
  primaryModel: string;
  fallbackModels: string[];
  retryConfig: RetryConfig;
  fallbackRetryConfig: RetryConfig;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}