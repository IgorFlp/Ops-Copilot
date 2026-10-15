import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { DomainError } from "../errors/domain-error.js";
import { createReactStrategy } from "./react.js";

test("ReAct captures actions, observations, answer, and model-call count", async () => {
  const strategy = createReactStrategy(async (input, maxIterations) => {
    assert.equal(input, "What is firing?");
    assert.equal(maxIterations, 3);
    return {
      messages: [
        new AIMessage({
          content: "",
          tool_calls: [
            {
              id: "call-1",
              name: "list_alerts",
              args: { status: "firing" },
              type: "tool_call",
            },
          ],
        }),
        new ToolMessage({
          content: '[{"status":"firing"}]',
          tool_call_id: "call-1",
        }),
        new AIMessage({ content: "One alert is firing." }),
      ],
    };
  });

  const result = await strategy.run("What is firing?", {
    maxIterations: 3,
  });
  assert.equal(result.answer, "One alert is firing.");
  assert.deepEqual(
    result.trace.map(({ type }) => type),
    ["action", "observation", "answer"],
  );
  assert.deepEqual(result.trace[0].tools, ["list_alerts"]);
  assert.deepEqual(result.trace[0].args, { status: "firing" });
  assert.equal(result.metrics.calls, 2);
  assert.ok(result.metrics.latencyMs >= 0);
});

test("ReAct reports tool/model failures and validates iteration bounds", async () => {
  const failure = new Error("provider unavailable");
  const strategy = createReactStrategy(async () => {
    throw failure;
  });
  await assert.rejects(strategy.run("Check alerts"), failure);
  await assert.rejects(
    strategy.run("Check alerts", { maxIterations: 0 }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "VALIDATION",
  );
});
