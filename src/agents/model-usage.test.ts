import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateModelUsage,
  combineModelUsage,
  extractPromptTokens,
} from "./model-usage.js";

test("extracts normalized LangChain input token usage", () => {
  assert.equal(
    extractPromptTokens({
      usage_metadata: { input_tokens: 17, output_tokens: 4, total_tokens: 21 },
    }),
    17,
  );
});

test("extracts provider token usage from raw structured output", () => {
  assert.equal(
    extractPromptTokens({
      raw: {
        response_metadata: {
          tokenUsage: { promptTokens: 23, completionTokens: 5, totalTokens: 28 },
        },
      },
      parsed: { answer: "ok" },
    }),
    23,
  );
});

test("normalized usage takes precedence over provider-specific usage", () => {
  assert.equal(
    extractPromptTokens({
      usage_metadata: { input_tokens: 11 },
      response_metadata: { tokenUsage: { promptTokens: 19 } },
    }),
    11,
  );
});

test("missing and invalid usage is unavailable while zero is valid", () => {
  assert.equal(extractPromptTokens({}), undefined);
  assert.equal(
    extractPromptTokens({ usage_metadata: { input_tokens: -1 } }),
    undefined,
  );
  assert.equal(
    extractPromptTokens({ usage_metadata: { input_tokens: 1.5 } }),
    undefined,
  );
  assert.equal(
    extractPromptTokens({ usage_metadata: { input_tokens: Number.MAX_SAFE_INTEGER + 1 } }),
    undefined,
  );
  assert.equal(
    extractPromptTokens({ usage_metadata: { input_tokens: 0 } }),
    0,
  );
});

test("aggregates only complete non-empty invocation lists", () => {
  assert.deepEqual(aggregateModelUsage([8, 0, 3]), {
    modelCalls: 3,
    promptTokens: 11,
  });
  assert.deepEqual(aggregateModelUsage([8, undefined, 3]), {
    modelCalls: 3,
  });
  assert.equal(aggregateModelUsage([]), undefined);
});

test("combines strategy summaries and preserves incomplete usage", () => {
  assert.deepEqual(
    combineModelUsage(
      { modelCalls: 2, promptTokens: 12 },
      { modelCalls: 1, promptTokens: 7 },
    ),
    { modelCalls: 3, promptTokens: 19 },
  );
  assert.deepEqual(
    combineModelUsage(
      { modelCalls: 1, promptTokens: 7 },
      { modelCalls: 2 },
    ),
    { modelCalls: 3 },
  );
  assert.equal(combineModelUsage(), undefined);
});

test("omits totals that overflow safe integer precision", () => {
  assert.deepEqual(
    aggregateModelUsage([Number.MAX_SAFE_INTEGER, 1]),
    { modelCalls: 2 },
  );
  assert.deepEqual(
    combineModelUsage(
      { modelCalls: 1, promptTokens: Number.MAX_SAFE_INTEGER },
      { modelCalls: 1, promptTokens: 1 },
    ),
    { modelCalls: 2 },
  );
});
