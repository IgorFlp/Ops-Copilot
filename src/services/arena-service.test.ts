import assert from "node:assert/strict";
import test from "node:test";
import { ReasoningStrategy } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";
import { createArenaService, strategies } from "./arena-service.js";

test("registers the base and reflected variants", () => {
  assert.deepEqual(
    strategies.map(({ name }) => name),
    [
      "react",
      "plan-and-execute",
      "reflect:react",
      "reflect:plan-and-execute",
    ],
  );
});

test("runs selected strategies against the same input with the same limit", async () => {
  const received: Array<[string, number | undefined]> = [];
  const strategy = (name: string): ReasoningStrategy => ({
    name,
    async run(input, options) {
      received.push([input, options?.maxIterations]);
      return {
        answer: `${name} answer`,
        trace: [{ type: "answer", content: `${name} answer` }],
        metrics: { calls: 1, latencyMs: 2 },
      };
    },
  });
  const service = createArenaService([
    strategy("react"),
    strategy("plan-and-execute"),
  ]);

  const result = await service.run("Investigate", {
    maxIterations: 5,
  });
  assert.deepEqual(received, [
    ["Investigate", 5],
    ["Investigate", 5],
  ]);
  assert.deepEqual(
    result.map(({ strategy: name }) => name),
    ["react", "plan-and-execute"],
  );
  assert.deepEqual(result.map(({ result: run }) => run.metrics.calls), [1, 1]);
});

test("passes reflection bounds to explicitly selected reflected strategies", async () => {
  const received: Array<[string, number | undefined]> = [];
  const makeStrategy = (name: string): ReasoningStrategy => ({
    name,
    async run(input, options) {
      received.push([input, options?.maxReflection]);
      return {
        answer: name,
        trace: [{ type: "answer", content: name }],
        metrics: { calls: 2, latencyMs: 4 },
      };
    },
  });
  const service = createArenaService([
    makeStrategy("react"),
    makeStrategy("plan-and-execute"),
    makeStrategy("reflect:react"),
    makeStrategy("reflect:plan-and-execute"),
  ]);

  const results = await service.run("Investigate", {
    strategyNames: ["reflect:react", "reflect:plan-and-execute"],
    maxReflection: 0,
  });

  assert.deepEqual(received, [
    ["Investigate", 0],
    ["Investigate", 0],
  ]);
  assert.deepEqual(
    results.map(({ strategy: name }) => name),
    ["reflect:react", "reflect:plan-and-execute"],
  );
});

test("omitted strategy names do not add reflected strategies to the default run", async () => {
  const invoked: string[] = [];
  const makeStrategy = (name: string): ReasoningStrategy => ({
    name,
    async run() {
      invoked.push(name);
      return {
        answer: name,
        trace: [],
        metrics: { calls: 0, latencyMs: 0 },
      };
    },
  });
  const service = createArenaService([
    makeStrategy("react"),
    makeStrategy("plan-and-execute"),
    makeStrategy("reflect:react"),
    makeStrategy("reflect:plan-and-execute"),
  ]);

  await service.run("Investigate");
  assert.deepEqual(invoked, ["react", "plan-and-execute"]);
});

test("rejects an empty selection and an unknown strategy without running one", async () => {
  let invoked = false;
  const available: ReasoningStrategy = {
    name: "react",
    async run() {
      invoked = true;
      return {
        answer: "",
        trace: [],
        metrics: { calls: 0, latencyMs: 0 },
      };
    },
  };
  const service = createArenaService([available]);

  await assert.rejects(
    service.run("Check", { strategyNames: [] }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "VALIDATION",
  );
  await assert.rejects(
    service.run("Check", { strategyNames: ["plan-and-execute"] }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "VALIDATION",
  );
  assert.equal(invoked, false);
});
