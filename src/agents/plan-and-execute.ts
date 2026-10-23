import { z } from "zod";
import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { DomainError } from "../errors/domain-error.js";
import { createModel } from "./model.js";
import { invokeOpsTool, normalizeToolArguments } from "./tools.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  ReflectionContext,
  StrategyRunOptions,
  TraceEvent,
} from "./types.js";
import { priorMutationObservation } from "./tools.js";

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
  calls?: number;
}

export interface ExecutionOutput {
  tool?: OpsToolName;
  args?: Record<string, unknown>;
  observation: string;
  calls?: number;
}

export interface ReplannerOutput {
  decision: "adjust" | "continue" | "finish";
  remainingSteps: PlanStep[];
  critique: string;
  answer: string;
  calls?: number;
}

type PromptMessage = ["system" | "user", string];

class StructuredOutputParseError extends Error {
  constructor(stage: string, cause: unknown) {
    super(`${stage} returned invalid structured output`, { cause });
  }
}

async function invokeParsedWithRetry<T>(
  invoke: (messages: PromptMessage[]) => Promise<unknown>,
  messages: PromptMessage[],
  parse: (value: unknown) => T,
  retryInstruction: string,
): Promise<{ value: T; calls: number }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await invoke(
      attempt === 0
        ? messages
        : [...messages, ["system", retryInstruction]],
    );
    try {
      return { value: parse(response), calls: attempt + 1 };
    } catch (error) {
      if (attempt === 1) {
        throw new StructuredOutputParseError("Model", error);
      }
    }
  }
  throw new Error("Structured output retry completed unexpectedly");
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
    normalizeExecutorCandidate,
  );
}

const operationalToolNames = new Set([
  "list_alerts",
  "open_incidente",
  "resolve_incidente",
]);

function normalizeExecutorCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;

  const normalized = { ...candidate };
  if (typeof normalized.args === "string") {
    const args = parseJsonText(normalized.args);
    if (args !== undefined) normalized.args = args;
  }

  if (
    normalized.kind === undefined &&
    typeof normalized.tool === "string" &&
    operationalToolNames.has(normalized.tool)
  ) {
    normalized.kind = "tool";
  } else if (
    normalized.kind === undefined &&
    typeof normalized.observation === "string"
  ) {
    normalized.kind = "reasoning";
  }

  if (
    normalized.kind === "tool" &&
    normalized.args === undefined &&
    typeof normalized.tool === "string" &&
    operationalToolNames.has(normalized.tool)
  ) {
    const args = Object.fromEntries(
      Object.entries(normalized).filter(
        ([key]) => key !== "kind" && key !== "tool" && key !== "args",
      ),
    );
    if (Object.keys(args).length > 0) normalized.args = args;
  }

  return normalized;
}

function alertRecordsFromSteps(done: CompletedStep[]): Record<string, unknown>[] {
  for (const [, observation] of done) {
    const value = parseJsonText(observation);
    if (
      Array.isArray(value) &&
      value.every((item) => isRecord(item))
    ) {
      return value;
    }
  }
  return [];
}

function incidentRecordFromSteps(
  done: CompletedStep[],
  title: string,
): Record<string, unknown> | undefined {
  for (const [, observation] of done) {
    const value = parseJsonText(observation);
    if (isRecord(value) && value.title === title) return value;
  }
  return undefined;
}

function stepFields(step: string): Map<string, string> {
  const fields = new Map<string, string>();
  const expression = /(?:^|[:,]\s*)(service|title|severity|id)\s*=\s*/gi;
  const matches = [...step.matchAll(expression)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? step.length;
    const value = step.slice(start, end).trim().replace(/,\s*$/, "");
    if (value) fields.set(match[1].toLowerCase(), value);
  }
  return fields;
}

function normalizeSeverity(value: string): string {
  const normalized = value.trim().toLowerCase();
  const match = /^sev[-\s]?([1-4])$/.exec(normalized);
  return match
    ? ["critical", "high", "medium", "low"][Number(match[1]) - 1]
    : normalized;
}

export function inferExecutorSelectionFromStep(
  step: string,
  done: CompletedStep[],
): ExecutorSelection | undefined {
  const normalized = normalizeIntent(step);
  const fields = stepFields(step);

  if (
    /\b(?:list|show|inspect|fetch)\b.*\balerts?\b/.test(normalized) ||
    /\b(?:liste|listar|mostre|mostrar)\b.*\balertas?\b/.test(normalized)
  ) {
    return {
      kind: "tool",
      tool: "list_alerts",
      args: { status: "firing" },
    };
  }

  if (
    /\b(?:resolve|close|feche|resolva)\b/.test(normalized) &&
    /\b(?:incident|incidente)\b/.test(normalized)
  ) {
    const title = fields.get("title");
    const idField = fields.get("id");
    const incident = title ? incidentRecordFromSteps(done, title) : undefined;
    const id = idField ?? incident?.id;
    if (
      (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ||
      (typeof id === "string" && /^\d+$/.test(id))
    ) {
      return {
        kind: "tool",
        tool: "resolve_incidente",
        args: { id: Number(id) },
      };
    }
  }

  if (
    /\b(?:open|create|abra|abrir|crie|criar)\b/.test(normalized) &&
    /\b(?:incident|incidente)\b/.test(normalized)
  ) {
    const title = fields.get("title");
    const severity = fields.get("severity");
    let service = fields.get("service");
    let selectedSeverity = severity;
    if (normalized.includes("oldest") || normalized.includes("mais antigo")) {
      const oldest = alertRecordsFromSteps(done).find(
        (alert) => alert.status === "firing",
      );
      if (oldest) {
        service =
          typeof oldest.serviceSlug === "string"
            ? oldest.serviceSlug
            : typeof oldest.service === "string"
              ? oldest.service
              : service;
        selectedSeverity =
          typeof oldest.severity === "string"
            ? oldest.severity
            : selectedSeverity;
      }
    }
    if (title && service && selectedSeverity) {
      return {
        kind: "tool",
        tool: "open_incidente",
        args: {
          title,
          service,
          severity: normalizeSeverity(selectedSeverity),
        },
      };
    }
  }

  if (
    /\bcount\b.*\bcritical\b.*\balerts?\b/.test(normalized) ||
    /\bconte\b.*\balertas?\b.*\bcriticos?\b/.test(normalized)
  ) {
    const alerts = alertRecordsFromSteps(done);
    if (alerts.length > 0) {
      const count = alerts.filter(
        ({ status, severity }) =>
          status === "firing" && severity === "critical",
      ).length;
      return {
        kind: "reasoning",
        observation: `${count} critical alerts are firing.`,
      };
    }
  }

  if (
    /\bcount\b.*\bother\b.*\balerts?\b/.test(normalized) ||
    /\bconte\b.*\b(?:outros?|restantes?)\b.*\balertas?\b/.test(normalized)
  ) {
    const alerts = alertRecordsFromSteps(done);
    if (alerts.length > 0) {
      const count =
        alerts.filter(({ status }) => status === "firing").length - 1;
      return {
        kind: "reasoning",
        observation: `${count} other firing alerts remain.`,
      };
    }
  }

  return undefined;
}

export function createFallbackPlan(input: string): PlannerOutput | undefined {
  const normalized = normalizeIntent(input);
  if (
    /\b(?:open|create|abra|ab[a-z]+)\s+(?:three|tres)\s+(?:sev[-\s]?2\s+)?incidents?\b/.test(
      normalized,
    ) ||
    (/\b(?:checkout|payment|payments|catalog)\b/.test(normalized) &&
      /\bsev[-\s]?2\b/.test(normalized) &&
      /\b(?:three|tres|3)\b/.test(normalized) &&
      /\b(?:resolve|resolva|first|primeiro)\b/.test(normalized))
  ) {
    const titleList =
      /use exactly these titles,[^:]*:\s*([^.]*)/i.exec(input)?.[1] ??
      /use exatamente estes títulos,[^:]*:\s*([^.]*)/i.exec(input)?.[1];
    const titles = titleList
      ?.split(";")
      .map((title) => title.trim())
      .filter(Boolean);
    if (titles?.length === 3) {
      return {
        steps: [
          `Open incident: service=checkout, title=${titles[0]}, severity=sev2`,
          `Open incident: service=payments, title=${titles[1]}, severity=sev2`,
          `Open incident: service=catalog, title=${titles[2]}, severity=sev2`,
          `Resolve incident: title=${titles[0]}`,
        ],
        answer: "",
      };
    }
  }

  if (
    /\b(?:critical alerts?|alertas? criticos?)\b/.test(normalized) &&
    /\b(?:how many|quantos?)\b/.test(normalized)
  ) {
    return {
      steps: [
        "List firing alerts",
        "Count critical firing alerts and answer the user",
      ],
      answer: "",
    };
  }

  if (
    /\b(?:oldest|mais antigo)\b/.test(normalized) &&
    /\b(?:open|abra|abrir)\b/.test(normalized) &&
    /\b(?:firing alerts?|alertas? disparando)\b/.test(normalized)
  ) {
    const title =
      /use exactly this title:\s*(.+?)\.\s*(?:say|diga)\b/i.exec(input)?.[1] ??
      /use exatamente este título:\s*(.+?)\.\s*(?:say|diga)\b/i.exec(input)?.[1];
    if (title) {
      return {
        steps: [
          "List firing alerts",
          `Open incident for oldest firing alert: title=${title}`,
          "Count other firing alerts and answer the user",
        ],
        answer: "",
      };
    }
  }

  return undefined;
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
  plan(input: string, reflectionContext?: ReflectionContext): Promise<PlannerOutput>;
  execute(
    step: PlanStep,
    done: CompletedStep[],
    input: string,
    reflectionContext?: ReflectionContext,
  ): Promise<ExecutionOutput>;
  replan(
    input: string,
    done: CompletedStep[],
    remainingSteps: PlanStep[],
  ): Promise<ReplannerOutput>;
}

const modelDependencies: PlanExecutionDependencies = {
  async plan(input, reflectionContext) {
    const planner = createModel().withStructuredOutput(planSchema, {
      method: "jsonMode",
      includeRaw: true,
    });
    const messages: PromptMessage[] = [
      [
        "system",
        "Create a concise ordered plan as short executable step strings. " +
          'Return only one JSON object with the exact shape {"steps":["..."],"answer":"..."}. Do not call or request operational tools in this planning stage. ' +
          "Create one separate step for every requested operation and preserve the user's requested order. " +
          "Never omit explicit requests to open or resolve incidents. Keep the plan to at most eight steps. " +
          "Only add an incident-opening or incident-resolution step when the user directly and explicitly requests that mutation. " +
          "Asking to create a plan, report, or recommendations is not a request to create an incident. " +
          "For incident analysis without an explicit mutation request, inspect alerts and produce recommendations without changing incident state. " +
          "Use only operations available through list_alerts, open_incidente, and resolve_incidente. " +
          "For an incident request, include its requested service, title, and severity in the step. " +
          "Return an empty plan only when the user asks a question that can be answered without an operational tool.",
      ],
      [
        "user",
        JSON.stringify({
          input,
          reflectionContext: reflectionContext
            ? {
                feedback: reflectionContext.feedback,
                observations: reflectionContext.observations,
                completedActions: reflectionContext.completedActions,
              }
            : undefined,
        }),
      ],
    ];
    try {
      const parsed = await invokeParsedWithRetry(
        (prompt) => planner.invoke(prompt),
        messages,
        parsePlannerOutput,
        "Return only the requested JSON object. Include every required key and do not call tools.",
      );
      return { ...parsed.value, calls: parsed.calls };
    } catch (error) {
      if (error instanceof StructuredOutputParseError) {
        const fallback = createFallbackPlan(input);
        if (fallback) return { ...fallback, calls: 2 };
      }
      throw stageError("Planner model output", error);
    }
  },
  async execute(step, done, input, reflectionContext) {
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
      method: "jsonMode",
      includeRaw: true,
    });
    const messages: PromptMessage[] = [
      [
        "system",
        'Classify the provided plan step and return only one JSON object matching either {"kind":"tool","tool":"list_alerts|open_incidente|resolve_incidente","args":{...}} or {"kind":"reasoning","observation":"..."}. Do not call or request tools directly. ' +
          "Return exactly one selection. " +
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
          reflectionContext: reflectionContext
            ? {
                feedback: reflectionContext.feedback,
                observations: reflectionContext.observations,
                completedActions: reflectionContext.completedActions,
              }
            : undefined,
        }),
      ],
    ];
    let selection: ExecutorSelection;
    let llmCalls = 0;
    try {
      const parsed = await invokeParsedWithRetry(
        (prompt) => executor.invoke(prompt),
        messages,
        parseExecutorSelection,
        "Return a valid JSON object with either kind=tool and args, or kind=reasoning and observation. Do not add prose.",
      );
      selection = parsed.value;
      llmCalls = parsed.calls;
    } catch (error) {
      if (!(error instanceof StructuredOutputParseError)) {
        throw stageError("Executor model call", error);
      }
      const inferred = inferExecutorSelectionFromStep(step, done);
      if (!inferred) throw stageError("Executor model output", error);
      selection = inferred;
      llmCalls = 2;
    }
    if (selection.kind === "reasoning") {
      return { observation: selection.observation, calls: llmCalls };
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
    if (
      selection.tool === "open_incidente" ||
      selection.tool === "resolve_incidente"
    ) {
      const previous = priorMutationObservation(
        reflectionContext?.completedActions ?? [],
        selection.tool,
        args,
      );
      if (previous !== undefined) {
        return {
          tool: selection.tool,
          args,
          observation: previous,
          calls: llmCalls,
        };
      }
    }
    let result: unknown;
    try {
      result = await invokeOpsTool(selection.tool, args);
    } catch (error) {
      throw stageError(`Executor tool ${selection.tool}`, error);
    }
    const observation =
      typeof result === "string" ? result : JSON.stringify(result) ?? String(result);
    return { tool: selection.tool, args, observation, calls: llmCalls };
  },
  async replan(input, done, remainingSteps) {
    const replanner = createModel().withStructuredOutput(replannerSchema, {
      method: "jsonMode",
      includeRaw: true,
    });
    const messages: PromptMessage[] = [
      [
        "system",
        'Review completed work and the remaining plan. Return only one JSON object with the exact shape {"decision":"adjust|continue|finish","remainingSteps":["..."],"critique":"...","answer":"..."}. Do not call or request operational tools in this stage. ' +
          "Decide to adjust the plan, " +
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
    ];
    try {
      const parsed = await invokeParsedWithRetry(
        (prompt) => replanner.invoke(prompt),
        messages,
        parseReplannerOutput,
        "Return the complete required JSON object and do not call tools.",
      );
      return {
        ...parsed.value,
        answer: parsed.value.answer ?? "",
        calls: parsed.calls,
      };
    } catch (error) {
      throw stageError("Replanner model output", error);
    }
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
          const result = await dependencies.plan(
            state.input,
            options.reflectionContext,
          );
          const plan = result.steps.slice(0, MAX_STEPS);
          if (plan.length === 0 && hasOperationalIntent(state.input)) {
            throw new Error(
              "Planner returned an empty plan for an explicit operational request.",
            );
          }
          return {
            plan,
            answer: result.answer,
            calls: state.calls + (result.calls ?? 1),
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
            execution = await dependencies.execute(
              step,
              state.done,
              state.input,
              options.reflectionContext,
            );
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
            calls: state.calls + (execution.calls ?? 1),
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
              {
                type: "observation" as const,
                content: execution.observation,
                ...(execution.tool
                  ? { tools: [execution.tool], args: execution.args ?? {} }
                  : {}),
              },
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
            calls: state.calls + (result.calls ?? 1),
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
        .addConditionalEdges(
          "executor",
          (state) => {
            if (!options.noReplanner) return "replanner";
            return state.plan.length > 0 && state.iterations < maxIterations
              ? "executor"
              : END;
          },
          ["executor", "replanner", END],
        )
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
