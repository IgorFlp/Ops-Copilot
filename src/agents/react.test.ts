import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { DomainError } from "../errors/domain-error.js";
import { ReflectionContext } from "./types.js";
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

  test("ReAct passes reflection feedback and prior observations into its retry", async () => {
    const context: ReflectionContext = {
      feedback: ["Include the incident identifier."],
      observations: ['{"id":41,"status":"open"}'],
      completedActions: [
        {
          tool: "open_incidente",
          args: { title: "Latency", service: "checkout", severity: "high" },
          observation: '{"id":41,"status":"open"}',
        },
      ],
    };
    let receivedContext: ReflectionContext | undefined;
    const strategy = createReactStrategy(async (_input, _maxIterations, retry) => {
      receivedContext = retry;
      return { messages: [new AIMessage({ content: "Incident 41 is open." })] };
    });

    await strategy.run("Open a latency incident", {
      reflectionContext: context,
    });

    assert.deepEqual(receivedContext, context);
  });
  await assert.rejects(strategy.run("Check alerts"), failure);
  await assert.rejects(
    strategy.run("Check alerts", { maxIterations: 0 }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "VALIDATION",
  );
});
