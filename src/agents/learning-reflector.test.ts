import assert from "node:assert/strict";
import test from "node:test";
import {
  createLearningExtractor,
  learningSchema,
  parseLearningResult,
} from "./learning-reflector.js";

test("learning result requires one bounded fact only when hasLearning is true", () => {
  assert.deepEqual(
    parseLearningResult({
      hasLearning: true,
      fact: "The operator prefers concise incident summaries.",
    }),
    {
      hasLearning: true,
      fact: "The operator prefers concise incident summaries.",
    },
  );
  assert.deepEqual(parseLearningResult({ hasLearning: false, fact: "" }), {
    hasLearning: false,
    fact: "",
  });

  assert.equal(learningSchema.safeParse({ hasLearning: true, fact: "" }).success, false);
  assert.equal(
    learningSchema.safeParse({ hasLearning: false, fact: "a preference" }).success,
    false,
  );
  assert.equal(
    learningSchema.safeParse({
      hasLearning: true,
      fact: "x".repeat(2001),
    }).success,
    false,
  );
});

test("learning extractor forwards only the latest user message", async () => {
  let observed = "";
  const extractor = createLearningExtractor(async (message) => {
    observed = message;
    return { hasLearning: false, fact: "" };
  });

  await extractor("I prefer concise incident summaries.");
  assert.equal(observed, "I prefer concise incident summaries.");
});
