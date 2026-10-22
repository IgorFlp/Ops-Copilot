import { z } from "zod";
import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { DomainError } from "../errors/domain-error.js";
import { createModel } from "./model.js";
import { invokeOpsTool, normalizeToolArguments } from "./tools.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  StrategyRunOptions,
  TraceEvent,
} from "./types.js";

const DEFAULT_MAX_ITERATIONS = 8;
const MAX_ITERATIONS = 100;
const MAX_STEPS = 8;
const INCIDENT_REFERENCE =
  "(?:incidente|incidentes|incident|incidents)";
const INCIDENT_MODIFIER =
  "(?:(?:um|uma|o|a|os|as|the|an|new|novo|nova|primeiro|primeira|first|[0-9]+|one|two|three|four|five|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|critical|high|medium|low|severity|severidade|p[1-4]|sev[- ]?[1-4])\\s+){0,4}";
const OPEN_INCIDENT_INTENT = new RegExp(
  `\\b(?:abra|abrir|crie|criar|registre|registrar|open|create)\\s+${INCIDENT_MODIFIER}\\b${INCIDENT_REFERENCE}\\b`,
  "i",
);
const RESOLVE_INCIDENT_INTENT = new RegExp(
  `\\b(?:resolva|resolver|resolve|close|feche|fechar)\\s+${INCIDENT_MODIFIER}\\b${INCIDENT_REFERENCE}\\b`,
  "i",
);
const RESOLVE_FIRST_INTENT =
  /\b(resolva|resolver|resolve|close|feche|fechar)\s+(?:o|a|the)?\s*(?:primeiro|primeira|first)\b/i;

function normalizeIntent(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasPositiveIntent(
  normalized: string,
  expression: RegExp,
): boolean {
  const match = expression.exec(normalized);
  if (!match) return false;
  const prefix = normalized.slice(Math.max(0, match.index - 40), match.index);
  return (
    !/\b(?:nao|not|never|avoid|without|dont|don't)\b(?:\s+[\w'-]+){0,3}\s*$/i.test(
      prefix,
    ) &&
    !/\b(?:to|para)\s*$/i.test(prefix)
  );
}

function hasResolveIntent(normalized: string): boolean {
  return (
    hasPositiveIntent(normalized, RESOLVE_INCIDENT_INTENT) ||
    (hasPositiveIntent(normalized, RESOLVE_FIRST_INTENT) &&
      /\b(incidente|incidentes|incident|incidents)\b/i.test(normalized))
  );
}

export function isMutationAuthorized(
  input: string,
  tool: OpsToolName,
): boolean {
  const normalized = normalizeIntent(input);
  if (tool === "open_incidente") {
    return hasPositiveIntent(normalized, OPEN_INCIDENT_INTENT);
  }
  if (tool === "resolve_incidente") {
    return hasResolveIntent(normalized);
  }
  return true;
}

function hasOperationalIntent(input: string): boolean {
  const normalized = normalizeIntent(input);
  return (
    /\b(liste|listar|mostre|mostrar|list|show)\b/i.test(normalized) ||
    /\b(analise|analisar|investigue|investigar|analyze|investigate)\b.{0,40}\b(alertas?|incidentes?|alerts?|incidents?)\b/i.test(
      normalized,
    ) ||
    hasPositiveIntent(normalized, OPEN_INCIDENT_INTENT) ||
    hasResolveIntent(normalized)
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

function stageError(stage: string, error: unknown): Error {
  return new Error(`${stage} failed: ${errorMessage(error)}`, { cause: error });
}

const planSchema = z.object({
  steps: z.array(z.string().trim().min(1)).max(MAX_STEPS),
  answer: z.string().default(""),
});

const executionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool"),
    tool: z.enum(["list_alerts", "open_incidente", "resolve_incidente"]),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("reasoning"),
    observation: z.string().trim().min(1),
  }),
]);

const replannerSchema = z.object({
  decision: z.enum(["adjust", "continue", "finish"]),
  remainingSteps: z.array(z.string().trim().min(1)).max(MAX_STEPS),
  critique: z.string(),
  answer: z.string().default(""),
});

export type PlanStep = string;
export type CompletedStep = [step: PlanStep, observation: string];
export type OpsToolName = Extract<
  z.infer<typeof executionSchema>,
  { kind: "tool" }
>["tool"];
export type ExecutorSelection = z.infer<typeof executionSchema>;

export interface PlannerOutput {
  steps: PlanStep[];
  answer: string;
}

export interface ExecutionOutput {
  tool?: OpsToolName;
  args?: Record<string, unknown>;
  observation: string;
}

export interface ReplannerOutput {
  decision: "adjust" | "continue" | "finish";
  remainingSteps: PlanStep[];
  critique: string;
  answer: string;
}

function parseStructuredOutput<T>(
  schema: z.ZodType<T>,
  value: unknown,
  stage: string,
  normalizeCandidate: (candidate: unknown) => unknown = (candidate) =>
    candidate,
): T {
  const parsed = schema.safeParse(
    normalizeCandidate(extractStructuredCandidate(value) ?? value),
  );
  if (!parsed.success) {
    const detail =
      value === undefined || value === null
        ? "Model returned no structured output"
        : `Model returned invalid structured output: ${parsed.error.message}${getStructuredOutputDiagnostic(value)}`;
    throw stageError(stage, new Error(detail));
  }
  return parsed.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "");
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function extractStructuredCandidate(value: unknown): unknown {
  if (!isRecord(value) || !("raw" in value)) return undefined;
  const raw = value.raw;
  if (!isRecord(raw)) return undefined;

  if (value.parsed !== undefined && value.parsed !== null) {
    return value.parsed;
  }
  if (Array.isArray(raw.tool_calls)) {
    for (const call of raw.tool_calls) {
      if (isRecord(call) && isRecord(call.args)) return call.args;
    }
  }
  if (isRecord(raw.additional_kwargs)) {
    const toolCalls = raw.additional_kwargs.tool_calls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (!isRecord(call) || !isRecord(call.function)) continue;
        const args = call.function.arguments;
        if (typeof args === "string") {
          const parsed = parseJsonText(args);
          if (parsed !== undefined) return parsed;
        }
      }
    }
  }
  if (typeof raw.content === "string") {
    return parseJsonText(raw.content);
  }
  if (Array.isArray(raw.content)) {
    const text = raw.content
      .filter(
        (part): part is { text: string } =>
          isRecord(part) && typeof part.text === "string",
      )
      .map(({ text: part }) => part)
      .join("\n");
    return parseJsonText(text);
  }
  return undefined;
}

function getStructuredOutputDiagnostic(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.raw)) return "";
  const raw = value.raw;
  const calls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
  const toolNames: string[] = [];
  for (const call of calls) {
    if (isRecord(call) && typeof call.name === "string") {
      toolNames.push(call.name);
    }
  }
  const contentPresent =
    (typeof raw.content === "string" && raw.content.trim().length > 0) ||
    (Array.isArray(raw.content) && raw.content.length > 0);
  return ` (provider response: ${toolNames.length ? `tool call(s) ${toolNames.join(", ")}` : contentPresent ? "text content did not match the expected JSON schema" : "no tool call or text content"})`;
}

export function parseExecutorSelection(value: unknown): ExecutorSelection {
  return parseStructuredOutput(
    executionSchema,
    value,
    "Executor model output",
    (candidate) => {
      if (!isRecord(candidate) || candidate.kind !== "tool") return candidate;
      if (typeof candidate.args !== "string") return candidate;
      const args = parseJsonText(candidate.args);
      return args === undefined ? candidate : { ...candidate, args };
    },
  );
}

export function parsePlannerOutput(value: unknown): PlannerOutput {
  return parseStructuredOutput(planSchema, value, "Planner model output");
}

export function parseReplannerOutput(value: unknown): ReplannerOutput {
  return parseStructuredOutput(
    replannerSchema,
    value,
    "Replanner model output",
  );
}

export interface PlanExecutionDependencies {
  plan(input: string): Promise<PlannerOutput>;
  execute(
    step: PlanStep,
    done: CompletedStep[],
    input: string,
  ): Promise<ExecutionOutput>;
  replan(
    input: string,
    done: CompletedStep[],
    remainingSteps: PlanStep[],
  ): Promise<ReplannerOutput>;
}

const modelDependencies: PlanExecutionDependencies = {
  async plan(input) {
    const planner = createModel().withStructuredOutput(planSchema, {
      method: "functionCalling",
      includeRaw: true,
    });
    let result;
    try {
      result = await planner.invoke([
        [
          "system",
          "Create a concise ordered plan as short executable step strings. " +
            "Create one separate step for every requested operation and preserve the user's requested order. " +
            "Never omit explicit requests to open or resolve incidents. Keep the plan to at most eight steps. " +
          "Only add an incident-opening or incident-resolution step when the user directly and explicitly requests that mutation. " +
          "Asking to create a plan, report, or recommendations is not a request to create an incident. " +
          "For incident analysis without an explicit mutation request, inspect alerts and produce recommendations without changing incident state. " +
          "Use only operations available through list_alerts, open_incidente, and resolve_incidente. " +
            "For an incident request, include its requested service, title, and severity in the step. " +
            "Return an empty plan only when the user asks a question that can be answered without an operational tool.",
        ],
        ["user", input],
      ]);
    } catch (error) {
      throw stageError("Planner model call", error);
    }
    const output = parsePlannerOutput(result);
    return { steps: output.steps, answer: output.answer };
  },
  async execute(step, done, input) {
    const canOpenIncident = isMutationAuthorized(input, "open_incidente");
    const canResolveIncident = isMutationAuthorized(input, "resolve_incidente");
    const availableTools = [
      "list_alerts(status: firing | resolved | all)",
      ...(canOpenIncident
        ? ["open_incidente(title, service, severity: critical | high | medium | low)"]
        : []),
      ...(canResolveIncident
        ? ["resolve_incidente(id: numeric incident identifier)"]
        : []),
    ];
    const executor = createModel().withStructuredOutput(executionSchema, {
      method: "functionCalling",
      includeRaw: true,
    });
    let rawSelection: unknown;
    try {
      rawSelection = await executor.invoke([
        [
          "system",
          "Classify the provided plan step and return exactly one result. " +
            "For an executable operation, select one available tool " +
            `and supply its arguments. Available tools for this request: ${availableTools.join(", ")}. ` +
            "Do not select or invoke any tool not listed as available. " +
            "For a step that analyzes, compares, identifies causes, or summarizes information already present in completed steps, return kind=reasoning with a concise, user-facing observation grounded only in those completed observations. " +
            "Do not treat a reasoning step as a request to call a tool. If the step requires new operational data, use list_alerts. " +
            "Never invent tool names or results. " +
            "Map SEV-1 to critical, SEV-2 to high, SEV-3 to medium, and SEV-4 to low. " +
            "For service, use the canonical slug when known, or the service name/reference exactly as stated in the step. " +
            "Do not replace, skip, or invent requested service names. " +
            "For resolve_incidente, use the numeric id from the completed incident observations; the argument key must be id, not incident_id.",
        ],
        [
          "user",
          JSON.stringify({
            step,
            completedSteps: done,
            canOpenIncident,
            canResolveIncident,
          }),
        ],
      ]);
    } catch (error) {
      throw stageError("Executor model call", error);
    }
    const selection = parseExecutorSelection(rawSelection);
    if (selection.kind === "reasoning") {
      return { observation: selection.observation };
    }
    const args = normalizeToolArguments(selection.tool, selection.args);
    if (!isMutationAuthorized(input, selection.tool)) {
      throw stageError(
        "Executor policy",
        new Error(
          `Refusing to execute ${selection.tool}: the request did not explicitly ask to change incident state`,
        ),
      );
    }
    let result: unknown;
    try {
      result = await invokeOpsTool(selection.tool, args);
    } catch (error) {
      throw stageError(`Executor tool ${selection.tool}`, error);
    }
    const observation =
      typeof result === "string" ? result : JSON.stringify(result) ?? String(result);
    return { tool: selection.tool, args, observation };
  },
  async replan(input, done, remainingSteps) {
    const replanner = createModel().withStructuredOutput(replannerSchema, {
      method: "functionCalling",
      includeRaw: true,
    });
    let result;
    try {
      result = await replanner.invoke([
        [
          "system",
          "Review completed work and the remaining plan. Decide to adjust the plan, " +
            "continue it, or finish. Return revised remaining steps for adjust, the " +
            "unchanged or updated remaining steps for continue, and no remaining steps " +
            "for finish. Preserve every requested operation that has not completed, " +
            "including the original order, and do not finish while any requested work remains. " +
            "Do not add incident-opening or incident-resolution steps unless the original user request explicitly asked for that mutation. " +
            "When asked to analyze incidents or create a remediation plan, use completed observations to provide recommendations without changing incident state. " +
            "Use IDs from completed tool observations when a later step depends on them. " +
            "When all requested work is finished, provide the final user-facing answer.",
        ],
        ["user", JSON.stringify({ task: input, done, remainingSteps })],
      ]);
    } catch (error) {
      throw stageError("Replanner model call", error);
    }
    const output = parseReplannerOutput(result);
    return {
      ...output,
      answer: output.answer ?? "",
    };
  },
};

const PlanState = Annotation.Root({
  input: Annotation<string>(),
  plan: Annotation<PlanStep[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  done: Annotation<CompletedStep[]>({
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
          const result = await dependencies.plan(state.input);
          const plan = result.steps.slice(0, MAX_STEPS);
          if (plan.length === 0 && hasOperationalIntent(state.input)) {
            throw new Error(
              "Planner returned an empty plan for an explicit operational request.",
            );
          }
          return {
            plan,
            answer: result.answer,
            calls: state.calls + 1,
            trace: [
              {
                type: "plan" as const,
                content:
                  plan.map((step, index) => `${index + 1}. ${step}`).join("\n") ||
                  "No operational actions required",
              },
            ],
          };
        })
        .addNode("executor", async (state) => {
          const step = state.plan[0];
          if (!step) throw new Error("Plan executor received no pending step");
          let execution: ExecutionOutput;
          try {
            execution = await dependencies.execute(step, state.done, state.input);
          } catch (error) {
            const completed = state.done
              .map(([completedStep, observation]) => {
                const result = observation.length > 500
                  ? `${observation.slice(0, 500)}...`
                  : observation;
                return `- ${completedStep}: ${result}`;
              })
              .join("\n");
            const partial = completed
              ? ` Previously completed steps:\n${completed}`
              : " No steps completed in this run.";
            throw stageError(`Execution of plan step "${step}"${partial}`, error);
          }
          return {
            plan: state.plan.slice(1),
            done: [[step, execution.observation] as CompletedStep],
            iterations: state.iterations + 1,
            calls: state.calls + 1,
            trace: [
              ...(execution.tool
                ? [
                    {
                      type: "action" as const,
                      content: step,
                      tools: [execution.tool],
                      args: execution.args ?? {},
                    },
                  ]
                : [
                    {
                      type: "thought" as const,
                      content: execution.observation,
                    },
                  ]),
              { type: "observation" as const, content: execution.observation },
            ],
          };
        })
        .addNode("replanner", async (state) => {
          const result = await dependencies.replan(
            state.input,
            state.done,
            state.plan,
          );
          const remainingCount = Math.max(0, MAX_STEPS - state.done.length);
          const plan =
            result.decision === "finish"
              ? []
              : result.remainingSteps.slice(0, remainingCount);
          return {
            plan,
            answer: result.answer,
            calls: state.calls + 1,
            trace: [
              {
                type: "critique" as const,
                content: `${result.decision}: ${result.critique}`,
              },
              {
                type: "plan" as const,
                content:
                  plan.map((step, index) => `${index + 1}. ${step}`).join("\n") ||
                  "No remaining steps",
              },
            ],
          };
        })
        .addEdge(START, "planner")
        .addConditionalEdges(
          "planner",
          (state) => (state.plan.length > 0 ? "executor" : END),
          ["executor", END],
        )
        .addEdge("executor", "replanner")
        .addConditionalEdges(
          "replanner",
          (state) =>
            state.plan.length > 0 && state.iterations < maxIterations
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
        result.done.map(([, observation]) => observation).filter(Boolean).join("\n") ||
        "No operational actions were required.";
      return {
        answer,
        trace: [...result.trace, { type: "answer", content: answer }],
        metrics: { calls: result.calls, latencyMs: Date.now() - started },
      };
    },
  };
}

export const planAndExecuteStrategy = createPlanAndExecuteStrategy();
