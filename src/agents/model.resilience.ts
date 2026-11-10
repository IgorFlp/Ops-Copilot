import { z } from "zod";
import { DomainError } from "../errors/domain-error.js";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, AIMessage, ContentBlock } from "@langchain/core/messages";
import type {
  FallbackTraceEvent,
  FallbackReason,
  ModelAttemptSummary,
  ModelAttemptError,
  ModelTokenUsage,
} from "./types.js";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface ModelConfiguration {
  primaryModel: string;
  fallbackModels: string[];
  retryConfig: RetryConfig;
  fallbackRetryConfig: RetryConfig;
}

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

export interface ResilientModelResult {
  content: string | ContentBlock[];
  modelUsed: string;
  fallbackCount: number;
  totalLatencyMs: number;
  attempts: ModelAttempt[];
  traceEvents: FallbackTraceEvent[];
}

export interface ModelMetrics {
  modelUsed: string;
  fallbackCount: number;
  totalLatencyMs: number;
  attempts: ModelAttempt[];
  primaryModelLatencyMs?: number;
}

const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1),
  baseDelayMs: z.number().int().positive(),
  maxDelayMs: z.number().int().positive(),
  backoffMultiplier: z.number().min(1),
  retryableStatusCodes: z.array(z.number().int().min(100).max(599)),
});

const ModelConfigurationSchema = z.object({
  primaryModel: z.string().min(1),
  fallbackModels: z.array(z.string().min(1)),
  retryConfig: RetryConfigSchema,
  fallbackRetryConfig: RetryConfigSchema,
});

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2.0,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

export const DEFAULT_FALLBACK_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 1,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2.0,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

export function loadModelConfiguration(): ModelConfiguration {
  const primary = process.env.OPENROUTER_MODEL?.trim();
  if (!primary) {
    throw new DomainError(
      "OPENROUTER_MODEL must be configured",
      "CONFIGURATION",
    );
  }

  const fallbackEnv = process.env.OPENROUTER_MODEL_FALLBACK?.trim() ?? "";
  const fallbacks = fallbackEnv
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .filter((m, i, arr) => arr.indexOf(m) === i)
    .filter((m) => m !== primary);

  return {
    primaryModel: primary,
    fallbackModels: fallbacks,
    retryConfig: DEFAULT_RETRY_CONFIG,
    fallbackRetryConfig: DEFAULT_FALLBACK_RETRY_CONFIG,
  };
}

export function isRetryableError(error: unknown, retryableStatusCodes: number[]): boolean {
  if (error instanceof Error) {
    const errorName = error.name;
    if (
      errorName === "APIConnectionError" ||
      errorName === "APITimeoutError" ||
      errorName === "RateLimitError" ||
      errorName === "InternalServerError"
    ) {
      return true;
    }
    if (errorName === "APIError" && "status" in error) {
      const status = (error as { status: number }).status;
      return retryableStatusCodes.includes(status);
    }
  }
  return false;
}

export function calculateDelay(
  attempt: number,
  config: RetryConfig,
): number {
  const baseDelay = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelayMs,
  );
  const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
  const delayWithJitter = baseDelay + jitter;
  return Math.max(0, Math.min(Math.floor(delayWithJitter), config.maxDelayMs));
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createChatOpenAIInstance(
  modelId: string,
  apiKey: string,
  options: { maxTokens?: number } = {},
): { invoke: (input: string | BaseMessage[]) => Promise<AIMessage> } {
  return new ChatOpenAI({
    model: modelId,
    apiKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0,
    ...(options.maxTokens === undefined
      ? {}
      : { maxTokens: options.maxTokens }),
  });
}

export function createFallbackTraceEvent(
  fromModel: string,
  toModel: string,
  reason: FallbackReason,
  attemptSummary: ModelAttemptSummary,
): FallbackTraceEvent {
  return {
    type: "fallback",
    content: `Fallback from ${fromModel} to ${toModel}: ${reason}`,
    timestamp: new Date().toISOString(),
    fromModel,
    toModel,
    reason,
    attemptSummary,
  };
}

export async function executeWithRetry(
  modelId: string,
  model: { invoke: (input: string | BaseMessage[]) => Promise<AIMessage> },
  input: string | BaseMessage[],
  retryConfig: RetryConfig,
): Promise<{ result: AIMessage; attempts: ModelAttempt[]; modelUsed: string }> {
  const attempts: ModelAttempt[] = [];
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
    const startTime = new Date().toISOString();
    let attemptRecord: ModelAttempt = {
      modelId,
      attemptNumber: attempt,
      startTime,
      success: false,
      retryable: false,
    };

    try {
      const result = await model.invoke(input);
      const endTime = new Date().toISOString();
      attemptRecord = {
        ...attemptRecord,
        endTime,
        latencyMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
        success: true,
      };
      attempts.push(attemptRecord);
      return { result, attempts, modelUsed: modelId };
    } catch (error) {
      const endTime = new Date().toISOString();
      const retryable = isRetryableError(error, retryConfig.retryableStatusCodes);
      lastError = error instanceof Error ? error : new Error(String(error));

      attemptRecord = {
        ...attemptRecord,
        endTime,
        latencyMs: new Date(endTime).getTime() - new Date(startTime).getTime(),
        success: false,
        error: {
          name: lastError.constructor.name,
          message: lastError.message,
          statusCode: "status" in lastError ? (lastError as { status: number }).status : undefined,
          code: "code" in lastError ? (lastError as { code: string }).code : undefined,
        },
        retryable,
      };
      attempts.push(attemptRecord);

      if (!retryable || attempt === retryConfig.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, retryConfig);
      await sleep(delay);
    }
  }

  throw lastError!;
}

interface RetryableModel {
  modelId: string;
  invoke(input: string | BaseMessage[]): Promise<ResilientModelResult>;
  withRetry(config: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number; backoffMultiplier?: number }): RetryableModel;
  withFallback(fallback: RetryableModel): RetryableModel;
}

export function createRetryableModel(
  modelId: string,
  apiKey: string,
  options: { maxTokens?: number } = {},
  retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
  customModel?: { invoke: (input: string | BaseMessage[]) => Promise<AIMessage> },
): RetryableModel {
  const baseModel = customModel ?? createChatOpenAIInstance(modelId, apiKey, options);

  const retryable: RetryableModel = {
    modelId,
    async invoke(input: string | BaseMessage[]) {
      try {
        const { result, attempts, modelUsed } = await executeWithRetry(modelId, baseModel, input, retryConfig);
        const totalLatencyMs = attempts.reduce((sum, a) => sum + (a.latencyMs || 0), 0);
        return {
          content: result.content,
          modelUsed,
          fallbackCount: 0,
          totalLatencyMs,
          attempts,
          traceEvents: [],
        };
      } catch (error) {
        // Attach attempts to error for fallback chain
        const errorWithAttempts = error as Error & { attempts: ModelAttempt[] };
        errorWithAttempts.attempts = (error as { attempts?: ModelAttempt[] }).attempts || [];
        throw errorWithAttempts;
      }
    },
    withRetry(config) {
      const newConfig: RetryConfig = {
        ...retryConfig,
        ...config,
      };
      return createRetryableModel(modelId, apiKey, options, newConfig, customModel);
    },
    withFallback(fallback) {
      return createFallbackModel(this, fallback, modelId, fallback.modelId || "fallback");
    },
  };

  return retryable;
}

function createFallbackModel(
  primary: RetryableModel,
  fallback: RetryableModel,
  primaryModelId: string,
  fallbackModelId: string,
): RetryableModel {
  const fallbackModel: RetryableModel = {
    modelId: fallbackModelId,
    async invoke(input: string | BaseMessage[]) {
      let primaryResult: ResilientModelResult;
      try {
        primaryResult = await primary.invoke(input);
        return primaryResult;
      } catch (primaryError) {
        // Extract attempts from the error (we'll attach them to the error)
        const primaryAttempts = (primaryError as Error & { attempts?: ModelAttempt[] }).attempts || [];
        
        const attemptSummary: ModelAttemptSummary = {
          totalAttempts: primaryAttempts.length,
          lastError: primaryAttempts.length > 0 && primaryAttempts[primaryAttempts.length - 1].error 
            ? primaryAttempts[primaryAttempts.length - 1].error 
            : null,
          totalLatencyMs: primaryAttempts.reduce((sum, a) => sum + (a.latencyMs || 0), 0),
        };
        
        const fallbackTraceEvent = createFallbackTraceEvent(
          primaryModelId,
          fallbackModelId,
          "retry_exhausted",
          attemptSummary,
        );
        
        const fallbackResult = await fallback.invoke(input);
        
        // Combine results
        const combinedAttempts = [...primaryAttempts, ...fallbackResult.attempts];
        const totalLatencyMs = combinedAttempts.reduce((sum, a) => sum + (a.latencyMs || 0), 0);
        
        return {
          content: fallbackResult.content,
          modelUsed: fallbackResult.modelUsed,
          fallbackCount: fallbackResult.fallbackCount + 1,
          totalLatencyMs,
          attempts: combinedAttempts,
          traceEvents: [fallbackTraceEvent, ...fallbackResult.traceEvents],
        };
      }
    },
    withRetry(config) {
      return createFallbackModel(primary.withRetry(config), fallback.withRetry(config), primaryModelId, fallbackModelId);
    },
    withFallback(nextFallback) {
      return createFallbackModel(this, nextFallback, primaryModelId, nextFallback.modelId);
    },
  };
  
  return fallbackModel;
}

export function createResilientModel(
  options: { maxTokens?: number } = {},
): RetryableModel {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new DomainError(
      "OPENROUTER_API_KEY must be configured",
      "CONFIGURATION",
    );
  }

  const config = loadModelConfiguration();

  let currentModel: RetryableModel = createRetryableModel(
    config.primaryModel,
    apiKey,
    options,
    config.retryConfig,
  );

  for (const fallbackModelId of config.fallbackModels) {
    const fallbackModel = createRetryableModel(
      fallbackModelId,
      apiKey,
      options,
      config.fallbackRetryConfig,
    );
    currentModel = currentModel.withFallback(fallbackModel);
  }

  return currentModel;
}

export function createModelWithResilience(
  options: { maxTokens?: number } = {},
): ChatOpenAI {
  const resilientModel = createResilientModel(options);
  return {
    ...resilientModel,
    withRetry: () => resilientModel,
    withFallback: () => resilientModel,
  } as unknown as ChatOpenAI;
}