import assert from "node:assert/strict";
import test from "node:test";
import { createPlanAndExecuteStrategy, PlanStep } from "./plan-and-execute.js";

function step(number: number): PlanStep {
  return {
    description: `Read alert batch ${number}`,
    tool: "list_alerts",
    args: { status: "firing" },
  };
}

test("plan strategy executes one step then replans and returns answer with counts", async () => {
  const executed: string[] = [];
  let replanCalls = 0;
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: [step(1), step(2)], answer: "" };
    },
    async execute(planStep) {
      executed.push(planStep.description);
      return { alert: planStep.description };
    },
    async replan(_input, completed) {
      replanCalls += 1;
      return {
        remainingSteps: replanCalls === 1 ? [step(2)] : [],
        critique: `Reviewed ${completed.length} step(s)`,
        answer: "Investigation completed.",
      };
    },
  });

  const result = await strategy.run("Investigate alerts");
  assert.deepEqual(executed, ["Read alert batch 1", "Read alert batch 2"]);
  assert.equal(replanCalls, 2);
  assert.equal(result.answer, "Investigation completed.");
  assert.equal(result.metrics.calls, 3);
  assert.equal(result.metrics.latencyMs >= 0, true);
  assert.deepEqual(
    result.trace.filter(({ type }) => type === "action").map(({ content }) => content),
    ["Read alert batch 1", "Read alert batch 2"],
  );
  assert.ok(result.trace.some(({ type }) => type === "critique"));
});

test("plan strategy respects iteration and eight-step bounds", async () => {
  let executed = 0;
  let replannedSteps = 0;
  const manySteps = Array.from({ length: 10 }, (_, index) => step(index + 1));
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: manySteps, answer: "" };
    },
    async execute() {
      executed += 1;
      return "observed";
    },
    async replan(_input, completed) {
      replannedSteps = Math.max(replannedSteps, completed.length);
      return {
        remainingSteps: manySteps,
        critique: "Continue within the plan bound",
        answer: "Stopped at a safe limit.",
      };
    },
  });

  const result = await strategy.run("Investigate", { maxIterations: 2 });
  assert.equal(executed, 2);
  assert.ok(replannedSteps <= 8);
  assert.equal(result.metrics.calls, 3);
  assert.equal(
    result.trace.filter(({ type }) => type === "action").length,
    2,
  );
});
