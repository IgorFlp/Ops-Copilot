import { z } from "zod";
import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { DomainError } from "../errors/domain-error.js";
import { createModel } from "./model.js";
import { invokeOpsTool } from "./tools.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  StrategyRunOptions,
  TraceEvent,
} from "./types.js";

const DEFAULT_MAX_ITERATIONS = 8;
const MAX_ITERATIONS = 100;
const MAX_STEPS = 8;

const planStepSchema = z.object({
  description: z.string().min(1),
  tool: z.enum(["list_alerts", "open_incidente", "resolve_incidente"]),
  args: z.record(z.string(), z.unknown()),
});

const plannerOutputSchema = z.object({
  steps: z.array(planStepSchema).max(MAX_STEPS),
  answer: z.string(),
});

const replannerOutputSchema = z.object({
  remainingSteps: z.array(planStepSchema).max(MAX_STEPS),
  critique: z.string(),
  answer: z.string(),
});

export type PlanStep = z.infer<typeof planStepSchema>;
export interface CompletedStep {
  step: PlanStep;
  observation: string;
}

export interface PlannerOutput {
  steps: PlanStep[];
  answer: string;
}

export interface ReplannerOutput {
  remainingSteps: PlanStep[];
  critique: string;
  answer: string;
}

export interface PlanExecutionDependencies {
  plan(input: string): Promise<PlannerOutput>;
  execute(step: PlanStep): Promise<unknown>;
  replan(
    input: string,
    completed: CompletedStep[],
    remainingSteps: PlanStep[],
  ): Promise<ReplannerOutput>;
}

const modelDependencies: PlanExecutionDependencies = {
  async plan(input) {
    const model = createModel().withStructuredOutput(plannerOutputSchema);
    return model.invoke(
      `Create a concise operational plan for this request. Return at most eight actionable steps. ` +
        `Use only the available operations list_alerts, open_incidente, resolve_incidente. ` +
        `If no action is required, return no steps and answer directly. Request: ${input}`,
    );
  },
  async execute(step) {
    return invokeOpsTool(step.tool, step.args);
  },
  async replan(input, completed, remainingSteps) {
    const model = createModel().withStructuredOutput(replannerOutputSchema);
    return model.invoke(
      JSON.stringify({
        task: input,
        completed,
        remainingSteps,
        instruction:
          "Review the latest result, give a concise critique, and return at most eight remaining steps. " +
          "When no steps remain, provide the final user-facing answer.",
      }),
    );
  },
};

const PlanState = Annotation.Root({
  input: Annotation<string>(),
  steps: Annotation<PlanStep[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  completed: Annotation<CompletedStep[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  iterations: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  calls: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  trace: Annotation<TraceEvent[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
});

export function createPlanAndExecuteStrategy(
  dependencies: PlanExecutionDependencies = modelDependencies,
): ReasoningStrategy {
  return {
    name: "plan-and-execute",
    async run(input, options: StrategyRunOptions = {}): Promise<ReasoningResult> {
      if (!input.trim()) {
        throw new DomainError("Input is required", "VALIDATION");
      }
      const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
      if (
        !Number.isSafeInteger(maxIterations) ||
        maxIterations < 1 ||
        maxIterations > MAX_ITERATIONS
      ) {
        throw new DomainError(
          `maxIterations must be between 1 and ${MAX_ITERATIONS}`,
          "VALIDATION",
        );
      }
      const started = Date.now();

      const graph = new StateGraph(PlanState)
        .addNode("planner", async (state) => {
          const plan = await dependencies.plan(state.input);
          const steps = plan.steps.slice(0, MAX_STEPS);
          return {
            steps,
            answer: plan.answer,
            calls: state.calls + 1,
            trace: [
              {
                type: "plan" as const,
                content:
                  steps.map((step, index) => `${index + 1}. ${step.description}`).join("\n") ||
                  "No operational actions required",
              },
            ],
          };
        })
        .addNode("executor", async (state) => {
          const step = state.steps[0];
          if (!step) throw new Error("Plan executor received no pending step");
          const result = await dependencies.execute(step);
          const observation =
            typeof result === "string" ? result : JSON.stringify(result);
          return {
            steps: state.steps.slice(1),
            completed: [{ step, observation }],
            iterations: state.iterations + 1,
            trace: [
              {
                type: "action" as const,
                content: step.description,
                tools: [step.tool],
                args: step.args,
              },
              { type: "observation" as const, content: observation },
            ],
          };
        })
        .addNode("replanner", async (state) => {
          const plan = await dependencies.replan(
            state.input,
            state.completed,
            state.steps,
          );
          const allowedCount = Math.max(0, MAX_STEPS - state.completed.length);
          const remainingSteps = plan.remainingSteps.slice(0, allowedCount);
          return {
            steps: remainingSteps,
            answer: plan.answer,
            calls: state.calls + 1,
            trace: [
              { type: "critique" as const, content: plan.critique },
              {
                type: "plan" as const,
                content:
                  remainingSteps
                    .map((step, index) => `${index + 1}. ${step.description}`)
                    .join("\n") || "No remaining steps",
              },
            ],
          };
        })
        .addEdge(START, "planner")
        .addConditionalEdges(
          "planner",
          (state) => (state.steps.length > 0 ? "executor" : END),
          ["executor", END],
        )
        .addEdge("executor", "replanner")
        .addConditionalEdges(
          "replanner",
          (state) =>
            state.steps.length > 0 && state.iterations < maxIterations
              ? "executor"
              : END,
          ["executor", END],
        )
        .compile();

      const result = await graph.invoke(
        { input },
        { recursionLimit: maxIterations * 3 + 2 },
      );
      const answer =
        result.answer ||
        result.completed
          .map(({ observation }) => observation)
          .filter(Boolean)
          .join("\n") ||
        "No operational actions were required.";
      const trace = [
        ...result.trace,
        { type: "answer" as const, content: answer },
      ];
      return {
        answer,
        trace,
        metrics: { calls: result.calls, latencyMs: Date.now() - started },
      };
    },
  };
}

export const planAndExecuteStrategy = createPlanAndExecuteStrategy();
