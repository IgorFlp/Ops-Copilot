import assert from "node:assert/strict";
import test from "node:test";
import type { Memory } from "./memory-service.js";
import { createLearningReflector } from "./learning-reflector.js";

const existingMemory: Memory = {
  id: 7,
  userId: "operator-a",
  fact: "The operator prefers concise incident summaries.",
  createdAt: "2026-11-04T00:00:00.000Z",
};

test("learning persists one extracted fact for the request owner", async () => {
  const calls: unknown[][] = [];
  const memoryService = {
    async remember(...args: [string, string]) {
      calls.push(args);
      return existingMemory;
    },
    async recall() {
      return [];
    },
    async replace() {
      throw new Error("replace must not be called");
    },
  };
  const reflector = createLearningReflector(
    memoryService,
    async (message) => {
      assert.equal(message, "I prefer concise incident summaries.");
      return {
        hasLearning: true,
        fact: "The operator prefers concise incident summaries.",
      };
    },
    async () => ({ kind: "not-correction", supersededMemoryId: null }),
  );

  await reflector.learn("operator-a", "I prefer concise incident summaries.");
  assert.deepEqual(calls, [[
    "operator-a",
    "The operator prefers concise incident summaries.",
  ]]);
});

test("explicit correction replaces exactly one selected owned memory", async () => {
  const replacements: unknown[][] = [];
  const memories = [existingMemory];
  const memoryService = {
    async remember() {
      throw new Error("remember must not be called for a correction");
    },
    async recall(userId: string) {
      assert.equal(userId, "operator-a");
      return memories;
    },
    async replace(...args: [string, number, string]) {
      replacements.push(args);
      return { ...existingMemory, fact: args[2] };
    },
  };
  const reflector = createLearningReflector(
    memoryService,
    async () => ({
      hasLearning: true,
      fact: "The operator prefers detailed incident summaries.",
    }),
    async ({ memories: candidates }) => ({
      kind: "correction",
      supersededMemoryId: candidates[0]?.id ?? null,
    }),
  );

  await reflector.learn(
    "operator-a",
    "Correction: I prefer detailed incident summaries.",
  );
  assert.deepEqual(replacements, [[
    "operator-a",
    existingMemory.id,
    "The operator prefers detailed incident summaries.",
  ]]);
});

test("ambiguous corrections do not change memories or add a new fact", async () => {
  let writes = 0;
  const memories = [
    existingMemory,
    { ...existingMemory, id: 8, fact: "Another concise summary preference." },
  ];
  const memoryService = {
    async remember() {
      writes += 1;
      return existingMemory;
    },
    async recall() {
      return memories;
    },
    async replace() {
      writes += 1;
      return existingMemory;
    },
  };
  const reflector = createLearningReflector(
    memoryService,
    async () => ({ hasLearning: true, fact: "A corrected preference." }),
    async () => ({ kind: "ambiguous", supersededMemoryId: null }),
  );

  await reflector.learn("operator-a", "Correction: here is my new preference.");
  assert.equal(writes, 0);
});

test("ambiguous correction preparation requests clarification without mutation", async () => {
  let writes = 0;
  const memories = [
    existingMemory,
    { ...existingMemory, id: 8, fact: "Another concise summary preference." },
  ];
  const memoryService = {
    async remember() {
      writes += 1;
      return existingMemory;
    },
    async recall() {
      return memories;
    },
    async replace() {
      writes += 1;
      return existingMemory;
    },
  };
  const reflector = createLearningReflector(
    memoryService,
    async () => ({ hasLearning: true, fact: "A corrected preference." }),
    async () => ({ kind: "ambiguous", supersededMemoryId: null }),
  );

  const correction = await reflector.prepareCorrection(
    "operator-a",
    "Correction: here is my new preference.",
  );
  assert.deepEqual(correction, { kind: "ambiguous" });
  assert.equal(writes, 0);
});

test("prepared correction is applied after response without re-extraction", async () => {
  const replacements: unknown[][] = [];
  let extractions = 0;
  const reflector = createLearningReflector(
    {
      async remember() {
        throw new Error("remember must not be called for a correction");
      },
      async recall(userId: string, query: string, k?: number) {
        assert.equal(userId, "operator-a");
        assert.equal(
          query,
          "The operator prefers detailed incident summaries.",
        );
        assert.equal(k, Number.MAX_SAFE_INTEGER);
        return [existingMemory];
      },
      async replace(...args: [string, number, string]) {
        replacements.push(args);
        return { ...existingMemory, fact: args[2] };
      },
    },
    async () => {
      extractions += 1;
      return {
        hasLearning: true,
        fact: "The operator prefers detailed incident summaries.",
      };
    },
    async ({ memories: candidates }) => ({
      kind: "correction",
      supersededMemoryId: candidates[0]?.id ?? null,
    }),
  );
  const message = "Correction: I prefer detailed incident summaries.";

  const correction = await reflector.prepareCorrection("operator-a", message);
  assert.deepEqual(correction, {
    kind: "replace",
    memoryId: existingMemory.id,
    fact: "The operator prefers detailed incident summaries.",
  });
  assert.deepEqual(replacements, []);

  await reflector.learn("operator-a", message, correction);
  assert.equal(extractions, 1);
  assert.deepEqual(replacements, [[
    "operator-a",
    existingMemory.id,
    "The operator prefers detailed incident summaries.",
  ]]);
});

test("uncertain or transient candidates are not persisted", async () => {
  let writes = 0;
  const memoryService = {
    async remember() {
      writes += 1;
      return existingMemory;
    },
    async recall() {
      return [];
    },
    async replace() {
      writes += 1;
      return existingMemory;
    },
  };
  const reflector = createLearningReflector(
    memoryService,
    async () => ({ hasLearning: false, fact: "" }),
    async () => ({ kind: "not-correction", supersededMemoryId: null }),
  );

  await reflector.learn("operator-a", "Restart this service once.");
  assert.equal(writes, 0);
});

test("secret-bearing input and extracted candidates fail closed", async () => {
  let extracted = 0;
  let writes = 0;
  const memoryService = {
    async remember() {
      writes += 1;
      return existingMemory;
    },
    async recall() {
      return [];
    },
    async replace() {
      writes += 1;
      return existingMemory;
    },
  };
  const reflector = createLearningReflector(
    memoryService,
    async () => {
      extracted += 1;
      return { hasLearning: true, fact: "password=supersecretvalue" };
    },
    async () => ({ kind: "not-correction", supersededMemoryId: null }),
  );

  for (const message of [
    "Use password=not-a-real-password",
    "Authorization: Bearer notarealtoken1234567890",
    "AWS key AKIA1234567890ABCDEF",
    "-----BEGIN PRIVATE KEY-----",
  ]) {
    await reflector.learn("operator-a", message);
  }
  assert.equal(extracted, 0);
  await reflector.learn("operator-a", "I prefer concise reports.");
  assert.equal(writes, 0);
});
