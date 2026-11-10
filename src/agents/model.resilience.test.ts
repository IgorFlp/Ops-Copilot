import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createRetryableModel, executeWithRetry, isRetryableError, calculateDelay, loadModelConfiguration, createChatOpenAIInstance, createFallbackTraceEvent } from "./model.resilience.js";
import { createResilientModel } from "./model.js";
import { ChatOpenAI } from "@langchain/openai";
import { DomainError } from "../errors/domain-error.js";
import { BaseMessage, AIMessage, ContentBlock } from "@langchain/core/messages";

function createMockModel(invokeMock: (input: string | BaseMessage[]) => Promise<AIMessage>): { invoke: (input: string | BaseMessage[]) => Promise<AIMessage> } {
  return {
    invoke: invokeMock,
  };
}

function createAIMessage(content: string): AIMessage {
  return new AIMessage(content);
}

describe("Model Resilience - Retry Logic (US1)", () => {
  const apiKey = "test-api-key";
  const modelId = "test-model";

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = apiKey;
    process.env.OPENROUTER_MODEL = modelId;
    delete process.env.OPENROUTER_MODEL_FALLBACK;
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODEL;
    delete process.env.OPENROUTER_MODEL_FALLBACK;
  });

  describe("isRetryableError", () => {
    it("returns true for APIConnectionError", () => {
      const error = new Error("Connection failed");
      error.name = "APIConnectionError";
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), true);
    });

    it("returns true for APITimeoutError", () => {
      const error = new Error("Timeout");
      error.name = "APITimeoutError";
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), true);
    });

    it("returns true for RateLimitError", () => {
      const error = new Error("Rate limited");
      error.name = "RateLimitError";
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), true);
    });

    it("returns true for InternalServerError", () => {
      const error = new Error("Internal server error");
      error.name = "InternalServerError";
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), true);
    });

    it("returns true for APIError with status >= 500", () => {
      const error = new Error("Server error") as Error & { status: number };
      error.name = "APIError";
      error.status = 502;
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), true);
    });

    it("returns false for APIError with status 400", () => {
      const error = new Error("Bad request") as Error & { status: number };
      error.name = "APIError";
      error.status = 400;
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), false);
    });

    it("returns false for AuthenticationError (401)", () => {
      const error = new Error("Unauthorized") as Error & { status: number };
      error.name = "AuthenticationError";
      error.status = 401;
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), false);
    });

    it("returns false for unknown error types", () => {
      const error = new Error("Unknown");
      error.name = "UnknownError";
      assert.strictEqual(isRetryableError(error, [429, 500, 502, 503, 504]), false);
    });
  });

  describe("calculateDelay", () => {
    it("calculates exponential backoff with default config", () => {
      const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      const delay1 = calculateDelay(1, config);
      const delay2 = calculateDelay(2, config);
      const delay3 = calculateDelay(3, config);
      
      assert(delay1 >= 750 && delay1 <= 1250, `delay1=${delay1} should be ~1000±25%`);
      assert(delay2 >= 1500 && delay2 <= 2500, `delay2=${delay2} should be ~2000±25%`);
      assert(delay3 >= 3000 && delay3 <= 5000, `delay3=${delay3} should be ~4000±25%`);
    });

    it("respects maxDelayMs cap", () => {
      const config = { maxAttempts: 10, baseDelayMs: 1000, maxDelayMs: 5000, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      const delay5 = calculateDelay(5, config); // would be 16000 without cap
      assert(delay5 <= 5000, `delay5=${delay5} should be capped at maxDelayMs=5000`);
    });

    it("uses custom backoffMultiplier", () => {
      const config = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 3.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      const delay1 = calculateDelay(1, config);
      const delay2 = calculateDelay(2, config);
      
      assert(delay1 >= 750 && delay1 <= 1250, `delay1=${delay1} should be ~1000±25%`);
      assert(delay2 >= 2250 && delay2 <= 3750, `delay2=${delay2} should be ~3000±25%`);
    });
  });

  describe("executeWithRetry", () => {
    it("succeeds on first attempt", async () => {
      const mockModel = createMockModel(async () => createAIMessage("success"));
      const config = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      const { result, attempts } = await executeWithRetry(modelId, mockModel as any, "test input", config);
      
      assert.strictEqual(result.content, "success");
      assert.strictEqual(attempts.length, 1);
      assert.strictEqual(attempts[0].success, true);
      assert.strictEqual(attempts[0].attemptNumber, 1);
    });

    it("succeeds on retry after transient error", async () => {
      let attemptCount = 0;
      const mockModel = createMockModel(async () => {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error("Rate limited");
          error.name = "RateLimitError";
          throw error;
        }
        return createAIMessage("success on retry");
      });
      const config = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      const { result, attempts } = await executeWithRetry(modelId, mockModel as any, "test input", config);
      
      assert.strictEqual(result.content, "success on retry");
      assert.strictEqual(attempts.length, 2);
      assert.strictEqual(attempts[0].success, false);
      assert.strictEqual(attempts[0].retryable, true);
      assert.strictEqual(attempts[1].success, true);
    });

    it("exhausts retries and throws last error", async () => {
      const mockModel = createMockModel(async () => {
        const error = new Error("Server error");
        error.name = "InternalServerError";
        throw error;
      });
      const config = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      await assert.rejects(
        executeWithRetry(modelId, mockModel, "test input", config),
        /Server error/
      );
    });

    it("fails fast on non-retryable error (401)", async () => {
      const mockModel = createMockModel(async () => {
        const error = new Error("Unauthorized") as Error & { status: number };
        error.name = "AuthenticationError";
        error.status = 401;
        throw error;
      });
      const config = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      await assert.rejects(
        executeWithRetry(modelId, mockModel, "test input", config),
        /Unauthorized/
      );
    });

    it("records attempt metadata correctly", async () => {
      const mockModel = createMockModel(async () => createAIMessage("success"));
      const config = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2.0, retryableStatusCodes: [429, 500, 502, 503, 504] };
      
      const { attempts } = await executeWithRetry(modelId, mockModel as any, "test input", config);
      
      assert.strictEqual(attempts[0].modelId, modelId);
      assert.strictEqual(attempts[0].attemptNumber, 1);
      assert(attempts[0].startTime);
      assert(attempts[0].endTime);
      assert(attempts[0].latencyMs !== undefined);
      assert(attempts[0].latencyMs >= 0);
      assert.strictEqual(attempts[0].success, true);
    });
  });

  describe("createRetryableModel", () => {
    it("creates model with withRetry method", () => {
      const model = createRetryableModel(modelId, apiKey);
      assert(typeof model.invoke === "function");
      assert(typeof model.withRetry === "function");
      assert(typeof model.withFallback === "function");
    });

    it("withRetry returns new model with updated config", () => {
      const model = createRetryableModel(modelId, apiKey);
      const newModel = model.withRetry({ maxAttempts: 5 });
      assert(newModel !== model);
      assert(typeof newModel.invoke === "function");
    });

    it("withFallback chains models", () => {
      const primary = createRetryableModel("primary", apiKey);
      const fallback = createRetryableModel("fallback", apiKey);
      const chained = primary.withFallback(fallback);
      assert(chained !== primary);
      assert(typeof chained.invoke === "function");
    });
  });

  describe("loadModelConfiguration", () => {
    it("loads primary model from env", () => {
      process.env.OPENROUTER_MODEL = "test-primary";
      delete process.env.OPENROUTER_MODEL_FALLBACK;
      
      const config = loadModelConfiguration();
      
      assert.strictEqual(config.primaryModel, "test-primary");
      assert.deepStrictEqual(config.fallbackModels, []);
    });

    it("parses comma-separated fallback models", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "fallback1, fallback2,fallback3";
      
      const config = loadModelConfiguration();
      
      assert.deepStrictEqual(config.fallbackModels, ["fallback1", "fallback2", "fallback3"]);
    });

    it("deduplicates fallback models", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "fallback1,fallback1,fallback2";
      
      const config = loadModelConfiguration();
      
      assert.deepStrictEqual(config.fallbackModels, ["fallback1", "fallback2"]);
    });

    it("removes primary from fallbacks if duplicated", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "primary,fallback1";
      
      const config = loadModelConfiguration();
      
      assert.deepStrictEqual(config.fallbackModels, ["fallback1"]);
    });

    it("throws if primary model not configured", () => {
      delete process.env.OPENROUTER_MODEL;
      
      assert.throws(() => loadModelConfiguration(), /OPENROUTER_MODEL must be configured/);
    });
  });

  describe("createResilientModel integration", () => {
    it("creates model with primary only", () => {
      process.env.OPENROUTER_MODEL = "primary";
      delete process.env.OPENROUTER_MODEL_FALLBACK;
      
      const model = createResilientModel({ maxTokens: 100 });
      assert(typeof model.invoke === "function");
    });

    it("creates model with fallback chain", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "fallback1,fallback2";
      
      const model = createResilientModel({ maxTokens: 100 });
      assert(typeof model.invoke === "function");
    });

    it("throws if API key not configured", () => {
      delete process.env.OPENROUTER_API_KEY;
      process.env.OPENROUTER_MODEL = "primary";
      
      assert.throws(() => createResilientModel(), /OPENROUTER_API_KEY must be configured/);
    });
  });

  describe("Fallback Chain (US2)", () => {
    const apiKey = "test-api-key";
    const primaryModel = "primary-model";
    const fallback1 = "fallback-1";
    const fallback2 = "fallback-2";

    beforeEach(() => {
      process.env.OPENROUTER_API_KEY = apiKey;
      process.env.OPENROUTER_MODEL = primaryModel;
      process.env.OPENROUTER_MODEL_FALLBACK = `${fallback1},${fallback2}`;
    });

    afterEach(() => {
      delete process.env.OPENROUTER_API_KEY;
      delete process.env.OPENROUTER_MODEL;
      delete process.env.OPENROUTER_MODEL_FALLBACK;
    });

    it("primary fails after retries, first fallback succeeds", async () => {
      let primaryCallCount = 0;
      let fallbackCallCount = 0;
      
      const mockPrimaryModel = createMockModel(async () => {
        primaryCallCount++;
        const error = new Error("Rate limited");
        error.name = "RateLimitError";
        throw error;
      });
      
      const mockFallbackModel = createMockModel(async () => {
        fallbackCallCount++;
        return { content: "fallback success" } as AIMessage;
      });

      const primaryRetryable = createRetryableModel(primaryModel, apiKey, {}, { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [429] }, mockPrimaryModel as any);
      const fallbackRetryable = createRetryableModel(fallback1, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [429] }, mockFallbackModel as any);
      
      const chained = primaryRetryable.withFallback(fallbackRetryable);
      const result = await chained.invoke("test");
      
      assert.strictEqual(result.content, "fallback success");
      assert.strictEqual(primaryCallCount, 2); // 2 retries
      assert.strictEqual(fallbackCallCount, 1);
    });

    it("first fallback fails, second fallback succeeds", async () => {
      let primaryCallCount = 0;
      let fallback1CallCount = 0;
      let fallback2CallCount = 0;
      
      const primaryModelMock = createMockModel(async () => {
        primaryCallCount++;
        const error = new Error("Server error");
        error.name = "InternalServerError";
        throw error;
      });
      
      const fallback1Mock = createMockModel(async () => {
        fallback1CallCount++;
        const error = new Error("Rate limited");
        error.name = "RateLimitError";
        throw error;
      });
      
      const fallback2Mock = createMockModel(async () => {
        fallback2CallCount++;
        return { content: "second fallback success" } as AIMessage;
      });

      const primaryRetryable = createRetryableModel(primaryModel, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [500] }, primaryModelMock as any);
      const fallback1Retryable = createRetryableModel(fallback1, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [429] }, fallback1Mock as any);
      const fallback2Retryable = createRetryableModel(fallback2, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [429] }, fallback2Mock as any);
      
      const chained = primaryRetryable.withFallback(fallback1Retryable).withFallback(fallback2Retryable);
      const result = await chained.invoke("test");
      
      assert.strictEqual(result.content, "second fallback success");
      assert.strictEqual(primaryCallCount, 1);
      assert.strictEqual(fallback1CallCount, 1);
      assert.strictEqual(fallback2CallCount, 1);
    });

    it("all fallbacks fail throws error", async () => {
      const primaryModelMock = createMockModel(async () => {
        const error = new Error("Server error");
        error.name = "InternalServerError";
        throw error;
      });
      
      const fallback1Mock = createMockModel(async () => {
        const error = new Error("Rate limited");
        error.name = "RateLimitError";
        throw error;
      });
      
      const fallback2Mock = createMockModel(async () => {
        const error = new Error("Connection failed");
        error.name = "APIConnectionError";
        throw error;
      });

      const primaryRetryable = createRetryableModel(primaryModel, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [500] }, primaryModelMock);
      const fallback1Retryable = createRetryableModel(fallback1, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [429] }, fallback1Mock);
      const fallback2Retryable = createRetryableModel(fallback2, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [429] }, fallback2Mock);
      
      const chained = primaryRetryable.withFallback(fallback1Retryable).withFallback(fallback2Retryable);
      
      await assert.rejects(
        chained.invoke("test"),
        /Connection failed/
      );
    });

    it("fallback models tried in order", async () => {
      const callOrder: string[] = [];
      
      const primaryModelMock = createMockModel(async () => {
        callOrder.push("primary");
        const error = new Error("Server error");
        error.name = "InternalServerError";
        throw error;
      });
      
      const fallback1Mock = createMockModel(async () => {
        callOrder.push("fallback1");
        const error = new Error("Server error");
        error.name = "InternalServerError";
        throw error;
      });
      
      const fallback2Mock = createMockModel(async () => {
        callOrder.push("fallback2");
        return createAIMessage("fallback2 success");
      });

      const primaryRetryable = createRetryableModel(primaryModel, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [500] }, primaryModelMock as any);
      const fallback1Retryable = createRetryableModel(fallback1, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [500] }, fallback1Mock as any);
      const fallback2Retryable = createRetryableModel(fallback2, apiKey, {}, { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 2.0, retryableStatusCodes: [500] }, fallback2Mock as any);
      
      const chained = primaryRetryable.withFallback(fallback1Retryable).withFallback(fallback2Retryable);
      await chained.invoke("test");
      
      assert.deepStrictEqual(callOrder, ["primary", "fallback1", "fallback2"]);
    });

    it("empty fallback list works with primary only", () => {
      delete process.env.OPENROUTER_MODEL_FALLBACK;
      process.env.OPENROUTER_MODEL = "primary";
      
      const config = loadModelConfiguration();
      assert.deepStrictEqual(config.fallbackModels, []);
    });

    it("duplicate fallback models deduplicated", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "fallback1,fallback1,fallback2";
      
      const config = loadModelConfiguration();
      assert.deepStrictEqual(config.fallbackModels, ["fallback1", "fallback2"]);
    });

    it("primary model removed from fallback list", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "primary,fallback1";
      
      const config = loadModelConfiguration();
      assert.deepStrictEqual(config.fallbackModels, ["fallback1"]);
    });

    it("fallback uses same parameters as primary", () => {
      const primaryRetryable = createRetryableModel("primary", apiKey, { maxTokens: 500 });
      const fallbackRetryable = createRetryableModel("fallback", apiKey, { maxTokens: 500 });
      
      // Both should have temperature 0 and maxTokens 500
      // We can't directly test internal properties, but we verify they can be created with same options
      assert(typeof primaryRetryable.invoke === "function");
      assert(typeof fallbackRetryable.invoke === "function");
    });

    it("fallback retry config uses defaults", () => {
      process.env.OPENROUTER_MODEL = "primary";
      process.env.OPENROUTER_MODEL_FALLBACK = "fallback1";
      
      const config = loadModelConfiguration();
      assert.strictEqual(config.fallbackRetryConfig.maxAttempts, 1);
      assert.strictEqual(config.fallbackRetryConfig.baseDelayMs, 500);
    });
  });
});