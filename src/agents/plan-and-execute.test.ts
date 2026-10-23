import assert from "node:assert/strict";
import test from "node:test";
import {
  createPlanAndExecuteStrategy,
  createFallbackPlan,
  inferExecutorSelectionFromStep,
  isMutationAuthorized,
  parseExecutorSelection,
  parsePlannerOutput,
  parseReplannerOutput,
  PlanStep,
} from "./plan-and-execute.js";
import { normalizeToolArguments } from "./tools.js";
import { ReflectionContext } from "./types.js";

function step(number: number): PlanStep {
  return `Read alert batch ${number}`;
}

function execution(stepDescription: string) {
  return {
    tool: "list_alerts" as const,
    args: { status: "firing" },
    observation: JSON.stringify({ alert: stepDescription }),
  };
}

test("does not authorize incident mutations for analysis and plan requests", () => {
  const request = "Analise os incidentes e crie um plano de correção";

  assert.equal(isMutationAuthorized(request, "open_incidente"), false);
  assert.equal(isMutationAuthorized(request, "resolve_incidente"), false);
  assert.equal(isMutationAuthorized(request, "list_alerts"), true);
  assert.equal(
    isMutationAuthorized(
      "Crie um plano para abrir um incidente",
      "open_incidente",
    ),
    false,
  );
  assert.equal(
    isMutationAuthorized(
      "Não abra incidente; apenas recomende correções",
      "open_incidente",
    ),
    false,
  );
  assert.equal(
    isMutationAuthorized(
      "Não resolva o primeiro incidente",
      "resolve_incidente",
    ),
    false,
  );
  assert.equal(
    isMutationAuthorized("Crie um incidente para Payments", "open_incidente"),
    true,
  );
  assert.equal(
    isMutationAuthorized(
      "Abra três incidentes para checkout, payments e catalog e resolva o primeiro",
      "resolve_incidente",
    ),
    true,
  );
});

test("creates conservative fallback plans for the benchmark scenarios", () => {
  assert.deepEqual(
    createFallbackPlan(
      "Quantos alertas criticos estão disparando? Não abra nem resolva incidentes.",
    )?.steps,
    ["List firing alerts", "Count critical firing alerts and answer the user"],
  );
  assert.deepEqual(
    createFallbackPlan(
      "Abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem e resolva o primeiro. " +
        "Use exatamente estes títulos, na mesma ordem: run-C2-checkout; run-C2-payment; run-C2-catalog.",
    )?.steps,
    [
      "Open incident: service=checkout, title=run-C2-checkout, severity=sev2",
      "Open incident: service=payments, title=run-C2-payment, severity=sev2",
      "Open incident: service=catalog, title=run-C2-catalog, severity=sev2",
      "Resolve incident: title=run-C2-checkout",
    ],
  );
  assert.deepEqual(
    createFallbackPlan(
      "Dos alertas disparando, abra um incidente para o mais antigo e diga quantos sobraram. " +
        "Use exatamente este título: run-C3-oldest. Diga quantos outros alertas disparando sobraram, sem alterar o status do alerta.",
    )?.steps,
    [
      "List firing alerts",
      "Open incident for oldest firing alert: title=run-C3-oldest",
      "Count other firing alerts and answer the user",
    ],
  );
});

test("infers validated executor selections from explicit plan steps and observations", () => {
  const openingObservation = JSON.stringify({
    id: 42,
    title: "run-C2-checkout",
    status: "open",
  });
  assert.deepEqual(
    inferExecutorSelectionFromStep(
      "Resolve incident: title=run-C2-checkout",
      [["Open incident", openingObservation]],
    ),
    {
      kind: "tool",
      tool: "resolve_incidente",
      args: { id: 42 },
    },
  );

  const alerts = JSON.stringify([
    {
      id: 5,
      service: "Payments API",
      status: "firing",
      severity: "critical",
    },
    {
      id: 8,
      service: "Checkout API",
      status: "firing",
      severity: "critical",
    },
  ]);
  assert.deepEqual(
    inferExecutorSelectionFromStep("List firing alerts", []),
    {
      kind: "tool",
      tool: "list_alerts",
      args: { status: "firing" },
    },
  );
  assert.deepEqual(
    inferExecutorSelectionFromStep(
      "Count critical firing alerts and answer the user",
      [["List firing alerts", alerts]],
    ),
    {
      kind: "reasoning",
      observation: "2 critical alerts are firing.",
    },
  );
  assert.deepEqual(
    inferExecutorSelectionFromStep(
      "Open incident for oldest firing alert: title=run-C3-oldest",
      [["List firing alerts", alerts]],
    ),
    {
      kind: "tool",
      tool: "open_incidente",
      args: {
        title: "run-C3-oldest",
        service: "Payments API",
        severity: "critical",
      },
    },
  );
});

test("validates executor selections and reports missing model output explicitly", () => {
  assert.deepEqual(
    parseExecutorSelection({
      kind: "reasoning",
      observation: "Latency and errors are elevated on dependent services.",
    }),
    {
      kind: "reasoning",
      observation: "Latency and errors are elevated on dependent services.",
    },
  );
  assert.deepEqual(
    parseExecutorSelection({
      kind: "tool",
      tool: "list_alerts",
      args: { status: "firing" },
    }),
    {
      kind: "tool",
      tool: "list_alerts",
      args: { status: "firing" },
    },
  );
  assert.deepEqual(
    parseExecutorSelection({
      raw: {
        content: JSON.stringify({
          tool: "resolve_incidente",
          args: { incidentId: 42 },
        }),
      },
      parsed: null,
    }),
    {
      kind: "tool",
      tool: "resolve_incidente",
      args: { incidentId: 42 },
    },
  );
  assert.deepEqual(
    parseExecutorSelection({
      observation: "The requested incident is now resolved.",
    }),
    {
      kind: "reasoning",
      observation: "The requested incident is now resolved.",
    },
  );
  assert.deepEqual(
    parseExecutorSelection({
      raw: {
        tool_calls: [
          {
            name: "extract",
            args: {
              kind: "tool",
              tool: "list_alerts",
              args: "{\"status\":\"firing\"}",
            },
          },
        ],
      },
      parsed: {
        kind: "tool",
        tool: "list_alerts",
        args: "{\"status\":\"firing\"}",
      },
    }),
    {
      kind: "tool",
      tool: "list_alerts",
      args: { status: "firing" },
    },
  );
  assert.throws(
    () => parseExecutorSelection(undefined),
    /Executor model output failed: Model returned no structured output/,
  );
  assert.throws(
    () => parseExecutorSelection({ kind: "tool" }),
    /Executor model output failed: Model returned invalid structured output/,
  );
});

test("parses structured outputs from provider raw responses and rejects missing plans", () => {
  assert.deepEqual(
    parsePlannerOutput({
      raw: {
        content: '{"steps":["List active alerts"],"answer":""}',
      },
      parsed: null,
    }),
    { steps: ["List active alerts"], answer: "" },
  );
  assert.deepEqual(
    parsePlannerOutput({
      raw: {
        tool_calls: [
          {
            name: "extract",
            args: { steps: ["List active alerts"], answer: "" },
          },
        ],
      },
      parsed: null,
    }),
    { steps: ["List active alerts"], answer: "" },
  );
  assert.deepEqual(
    parseReplannerOutput({
      decision: "finish",
      remainingSteps: [],
      critique: "All requested work is complete.",
    }),
    {
      decision: "finish",
      remainingSteps: [],
      critique: "All requested work is complete.",
      answer: "",
    },
  );
  assert.throws(
    () =>
      parsePlannerOutput({
        raw: { content: "I will analyze the incidents." },
        parsed: null,
      }),
    /Planner model output failed: Model returned invalid structured output:[\s\S]*text content did not match the expected JSON schema/,
  );
  assert.throws(
    () => parseReplannerOutput(undefined),
    /Replanner model output failed: Model returned no structured output/,
  );
  assert.throws(
    () =>
      parsePlannerOutput({
        raw: {
          tool_calls: [
            {
              name: "list_alerts",
              args: { status: "firing" },
            },
          ],
        },
        parsed: null,
      }),
    /Planner model output failed: Model returned invalid structured output:[\s\S]*provider response: tool call\(s\) list_alerts/,
  );
});

test("plan strategy executes one tool step then replans through finish", async () => {
  const executed: string[] = [];
  const completedBatches: Array<[string, string][]> = [];
  const executorInputs: string[] = [];
  let replanCalls = 0;
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: [step(1), step(2)], answer: "", calls: 2 };
    },
    async execute(planStep, _done, input) {
      executed.push(planStep);
      executorInputs.push(input);
      return { ...execution(planStep), calls: 3 };
    },
    async replan(_input, done, remainingSteps) {
      completedBatches.push(done);
      replanCalls += 1;
      if (replanCalls === 1) {
        return {
          decision: "adjust",
          remainingSteps: [step(2)],
          critique: "The first alert batch was reviewed.",
          answer: "",
          calls: 4,
        };
      }
      assert.deepEqual(remainingSteps, []);
      return {
        decision: "finish",
        remainingSteps: [],
        critique: "The investigation is complete.",
        answer: "Investigation completed.",
        calls: 4,
      };
    },
  });

  const result = await strategy.run("Investigate alerts");
  assert.deepEqual(executed, [step(1), step(2)]);
  assert.deepEqual(executorInputs, ["Investigate alerts", "Investigate alerts"]);
  assert.equal(replanCalls, 2);
  assert.deepEqual(completedBatches[1], [
    [step(1), execution(step(1)).observation],
    [step(2), execution(step(2)).observation],
  ]);
  assert.equal(result.answer, "Investigation completed.");
  assert.equal(result.metrics.calls, 16);
  assert.equal(result.metrics.latencyMs >= 0, true);
  assert.deepEqual(
    result.trace.filter(({ type }) => type === "action").map(({ content }) => content),
    [step(1), step(2)],
  );
  assert.ok(result.trace.some(({ type, content }) => type === "critique" && content.startsWith("adjust:")));
  assert.ok(result.trace.some(({ type, content }) => type === "critique" && content.startsWith("finish:")));
});

test("noReplanner executes the initial plan without invoking the replanner", async () => {
  const executed: string[] = [];
  let replanCalls = 0;
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: [step(1), step(2)], answer: "" };
    },
    async execute(planStep) {
      executed.push(planStep);
      return execution(planStep);
    },
    async replan() {
      replanCalls += 1;
      throw new Error("Replanner must be skipped");
    },
  });

  const result = await strategy.run("Investigate alerts", {
    noReplanner: true,
  });

  assert.deepEqual(executed, [step(1), step(2)]);
  assert.equal(replanCalls, 0);
  assert.equal(result.metrics.calls, 3);
  assert.equal(result.trace.some(({ type }) => type === "critique"), false);
});

test("records an analytical plan step without invoking a tool", async () => {
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return {
        steps: [
          "List active alerts",
          "Identify root-cause patterns from the alerts",
        ],
        answer: "",
      };
    },
    async execute(planStep, done) {
      if (planStep === "List active alerts") {
        assert.deepEqual(done, []);
        return {
          tool: "list_alerts",
          args: { status: "firing" },
          observation: '[{"title":"Latency elevated"}]',
        };
      }
      assert.equal(planStep, "Identify root-cause patterns from the alerts");
      assert.deepEqual(done, [["List active alerts", '[{"title":"Latency elevated"}]']]);
      return {
        observation: "Latency and checkout errors are elevated across services.",
      };
    },
    async replan(_input, done, remainingSteps) {
      if (done.length === 1) {
        return {
          decision: "continue",
          remainingSteps,
          critique: "The active alerts are available for analysis.",
          answer: "",
        };
      }
      assert.deepEqual(remainingSteps, []);
      assert.equal(
        done[1][1],
        "Latency and checkout errors are elevated across services.",
      );
      return {
        decision: "finish",
        remainingSteps: [],
        critique: "The available alerts were analyzed.",
        answer: "Investigate shared dependencies and recent deployments.",
      };
    },
  });

  const result = await strategy.run("Analyze alerts and recommend a fix");
  assert.equal(result.answer, "Investigate shared dependencies and recent deployments.");
  assert.ok(
    result.trace.some(
      ({ type, content }) =>
        type === "thought" &&
        content === "Latency and checkout errors are elevated across services.",
    ),
  );
  assert.deepEqual(
    result.trace
      .filter(({ type }) => type === "action")
      .map(({ tools }) => tools),
    [["list_alerts"]],
  );
});

test("plan strategy respects iteration and eight-step bounds", async () => {
  const manySteps = Array.from({ length: 10 }, (_, index) => step(index + 1));

  let limitedExecutions = 0;
  const iterationLimited = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: manySteps, answer: "" };
    },
    async execute(planStep) {
      limitedExecutions += 1;
      return execution(planStep);
    },
    async replan() {
      return {
        decision: "continue",
        remainingSteps: manySteps,
        critique: "Continue within the iteration limit.",
        answer: "",
      };
    },
  });

  const limitedResult = await iterationLimited.run("Investigate", {
    maxIterations: 2,
  });
  assert.equal(limitedExecutions, 2);
  assert.equal(limitedResult.metrics.calls, 5);

  let boundedExecutions = 0;
  const stepLimited = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: manySteps, answer: "" };
    },
    async execute(planStep) {
      boundedExecutions += 1;
      return execution(planStep);
    },
    async replan(_input, done) {
      assert.ok(done.length <= 8);
      return {
        decision: "continue",
        remainingSteps: manySteps,
        critique: "Continue if the eight-step ceiling allows it.",
        answer: "",
      };
    },
  });
  const boundedResult = await stepLimited.run("Investigate");
  assert.equal(boundedExecutions, 8);
  assert.equal(boundedResult.metrics.calls, 17);
  assert.equal(
    boundedResult.trace.filter(({ type }) => type === "action").length,
    8,
  );
});

test("does not report an empty successful plan for explicit incident actions", async () => {
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: [], answer: "" };
    },
    async execute() {
      throw new Error("No steps should execute");
    },
    async replan() {
      throw new Error("No steps should be replanned");
    },
  });

  await assert.rejects(
    strategy.run(
      "Abra três incidentes para checkout, payments e catalog e resolva o primeiro",
    ),
    /empty plan for an explicit operational request/,
  );
});

test("requires an alert lookup plan for incident analysis requests", async () => {
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: [], answer: "No incidents were analyzed." };
    },
    async execute() {
      throw new Error("The empty plan should be rejected before execution");
    },
    async replan() {
      throw new Error("The empty plan should be rejected before replanning");
    },
  });

  await assert.rejects(
    strategy.run("Analise os incidentes e crie um plano de correção"),
    /empty plan for an explicit operational request/,
  );
});

test("reports the failing plan step and prior completed observations", async () => {
  let executed = 0;
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return { steps: ["Open the checkout incident", "Open the payments incident"], answer: "" };
    },
    async execute(planStep) {
      executed += 1;
      if (executed === 2) throw new Error("Service not found: payments");
      return {
        tool: "open_incidente",
        args: { service: "checkout-api" },
        observation: '{"id":41,"status":"open"}',
      };
    },
    async replan() {
      return {
        decision: "continue",
        remainingSteps: ["Open the payments incident"],
        critique: "The first incident was created.",
        answer: "",
      };
    },
  });

  await assert.rejects(
    strategy.run("Open checkout then payments incidents"),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes('Execution of plan step "Open the payments incident"') &&
      error.message.includes('{"id":41,"status":"open"}') &&
      error.message.includes("Service not found: payments"),
  );
});

test("passes completed incident observations to resolution steps and normalizes incident_id", async () => {
  const strategy = createPlanAndExecuteStrategy({
    async plan() {
      return {
        steps: [
          "open_incidente service=checkout-api severity=high",
          "resolve_incidente first incident",
        ],
        answer: "",
      };
    },
    async execute(planStep, done) {
      if (planStep.startsWith("open_incidente")) {
        assert.deepEqual(done, []);
        return {
          tool: "open_incidente",
          args: { service: "checkout-api", severity: "high" },
          observation: '{"id":42,"status":"open"}',
        };
      }

      assert.deepEqual(done, [
        [
          "open_incidente service=checkout-api severity=high",
          '{"id":42,"status":"open"}',
        ],
      ]);
      const args = normalizeToolArguments("resolve_incidente", {
        incident_id: 42,
      });

      return {
        tool: "resolve_incidente",
        args,
        observation: '{"id":42,"status":"resolved"}',
      };
    },
    async replan(_input, _done, remainingSteps) {
      return {
        decision: remainingSteps.length > 0 ? "continue" : "finish",
        remainingSteps,
        critique: `Reviewed ${remainingSteps.length} pending step(s).`,
        answer:
          remainingSteps.length > 0 ? "" : "Incident opened and resolved.",
      };
    },
  });

  const result = await strategy.run("Open an incident and resolve the first");
  const resolutionAction = result.trace.find(
    ({ type, tools }) =>
      type === "action" && tools?.includes("resolve_incidente"),
  );
  assert.deepEqual(resolutionAction?.args, { incident_id: 42, id: 42 });
  assert.equal(result.answer, "Incident opened and resolved.");
});

test("passes reflection context to planning and execution on retries", async () => {
  const context: ReflectionContext = {
    feedback: ["Use the incident id from prior work."],
    observations: ['{"id":42,"status":"open"}'],
    completedActions: [
      {
        tool: "open_incidente",
        args: { title: "Latency", service: "checkout", severity: "high" },
        observation: '{"id":42,"status":"open"}',
      },
    ],
  };
  let receivedPlanContext: ReflectionContext | undefined;
  let receivedExecuteContext: ReflectionContext | undefined;
  const strategy = createPlanAndExecuteStrategy({
    async plan(_input, reflectionContext) {
      receivedPlanContext = reflectionContext;
      return { steps: ["Summarize the completed incident"], answer: "" };
    },
    async execute(_step, _done, _input, reflectionContext) {
      receivedExecuteContext = reflectionContext;
      return { observation: "Incident 42 is open." };
    },
    async replan() {
      return {
        decision: "finish",
        remainingSteps: [],
        critique: "The completed incident was summarized.",
        answer: "Incident 42 is open.",
      };
    },
  });

  await strategy.run("Summarize the incident", {
    reflectionContext: context,
  });

  assert.deepEqual(receivedPlanContext, context);
  assert.deepEqual(receivedExecuteContext, context);
});
