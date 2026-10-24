import assert from "node:assert/strict";
import test from "node:test";
import type { ReasoningStrategy } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";
import { createStrategyRegistry } from "./index.js";

function strategy(name: string): ReasoningStrategy {
  return {
    name,
    async run() {
      return {
        answer: `${name} result`,
        trace: [],
        metrics: { calls: 1, latencyMs: 2 },
      };
    },
  };
}

test("resolves registered strategies and defaults omitted names to react", () => {
  const react = strategy("react");
  const planAndExecute = strategy("plan-and-execute");
  const registry = createStrategyRegistry([react, planAndExecute]);

  assert.equal(registry.resolve().strategy, react);
  assert.equal(registry.resolve("plan-and-execute").strategy, planAndExecute);
});

test("rejects unsupported strategy names with a distinct domain error", () => {
  const registry = createStrategyRegistry([strategy("react")]);

  assert.throws(
    () => registry.resolve("unknown"),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === "UNSUPPORTED_STRATEGY" &&
      error.message.includes("unknown"),
  );
});

test("rejects duplicate strategy names when creating the registry", () => {
  assert.throws(
    () => createStrategyRegistry([strategy("react"), strategy("react")]),
    /Duplicate strategy name: react/,
  );
});
