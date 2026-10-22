import { z } from "zod";
import { DomainError } from "../errors/domain-error.js";
import { createModel } from "./model.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  ReflectionAction,
  ReflectionContext,
  StrategyRunOptions,
  TraceEvent,
} from "./types.js";

const DEFAULT_MAX_REFLECTION = 2;
const MAX_REFLECTION = 100;

export const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().describe("Specific, actionable feedback for the next answer."),
}).strict();

export type ReflectionVerdict = z.infer<typeof verdictSchema>;
export type ReflectionCritic = (
  input: string,
  result: ReasoningResult,
) => Promise<unknown>;

export interface ReflectionOptions {
  maxReflection?: number;
  critic?: ReflectionCritic;
}

const CRITIC_PROMPT =
  "Evaluate the candidate answer using only the user's request and the " +
  "observations listed in the trace. Do not treat thoughts, plans, prior " +
  "critique feedback, or unsupported assumptions as evidence. Approve only " +
  "when the answer is supported by the observations and addresses the request. " +
  "If not approved, provide specific, actionable corrections in feedback.";

export async function critique(
  input: string,
  result: ReasoningResult,
): Promise<ReflectionVerdict> {
  const observations = observationsOf(result.trace);
  return createModel()
    .withStructuredOutput(verdictSchema)
    .invoke([
      ["system", CRITIC_PROMPT],
      [
        "user",
        `Pedido: ${input}\n\nObservações:\n${observations.join("\n") || "(nenhuma)"}\n\nResposta:\n${result.answer}`,
      ],
    ]);
}

export function observationsOf(trace: TraceEvent[]): string[] {
  return trace
    .filter(({ type }) => type === "observation")
    .map(({ content }) => content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableValue).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function actionsOf(trace: TraceEvent[]): ReflectionAction[] {
  const actions: ReflectionAction[] = [];
  for (let index = 0; index < trace.length; index += 1) {
    const event = trace[index];
    if (event.type !== "action" || !event.tools?.length) continue;

    for (const toolName of event.tools) {
      if (toolName !== "open_incidente" && toolName !== "resolve_incidente") {
        continue;
      }
      const args =
        event.tools.length === 1
          ? event.args ?? {}
          : isRecord(event.args?.[toolName])
            ? event.args[toolName]
            : {};
      const observation = trace
        .slice(index + 1)
        .find(
          (candidate) =>
            candidate.type === "observation" &&
            (!candidate.tools?.length || candidate.tools.includes(toolName)),
        );
      if (observation) {
        actions.push({ tool: toolName, args, observation: observation.content });
      }
    }
  }
  return actions;
}

function mergeActions(
  existing: ReflectionAction[],
  additions: ReflectionAction[],
): ReflectionAction[] {
  const merged = [...existing];
  for (const action of additions) {
    if (
      !merged.some(
        (candidate) =>
          candidate.tool === action.tool &&
          stableValue(candidate.args) === stableValue(action.args),
      )
    ) {
      merged.push(action);
    }
  }
  return merged;
}

function parseVerdict(value: unknown): ReflectionVerdict {
  const parsed = verdictSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(
      `Critic output failed: ${parsed.error.message}`,
      "CONFIGURATION",
    );
  }
  return parsed.data;
}

function validateLimit(maxReflection: number): void {
  if (
    !Number.isSafeInteger(maxReflection) ||
    maxReflection < 0 ||
    maxReflection > MAX_REFLECTION
  ) {
    throw new DomainError(
      `maxReflection must be an integer between 0 and ${MAX_REFLECTION}`,
      "VALIDATION",
    );
  }
}

export function withReflection(
  strategy: ReasoningStrategy,
  options: ReflectionOptions = {},
): ReasoningStrategy {
  return {
    name: strategy.name.startsWith("reflect:")
      ? strategy.name
      : `reflect:${strategy.name}`,
    async run(
      input: string,
      runOptions: StrategyRunOptions = {},
    ): Promise<ReasoningResult> {
      const maxReflection =
        runOptions.maxReflection ??
        options.maxReflection ??
        DEFAULT_MAX_REFLECTION;
      validateLimit(maxReflection);

      const started = Date.now();
      const critic = options.critic ?? critique;
      const reflectionContext: ReflectionContext = {
        feedback: [...(runOptions.reflectionContext?.feedback ?? [])],
        observations: [
          ...(runOptions.reflectionContext?.observations ?? []),
        ],
        completedActions: [
          ...(runOptions.reflectionContext?.completedActions ?? []),
        ],
      };
      const trace: TraceEvent[] = [
        ...(runOptions.reflectionContext?.observations.map((content) => ({
          type: "observation" as const,
          content,
        })) ?? []),
      ];
      let calls = 0;
      let regenerations = 0;
      let current = await strategy.run(input, {
        ...runOptions,
        maxReflection: undefined,
        reflectionContext:
          runOptions.reflectionContext === undefined
            ? undefined
            : reflectionContext,
      });

      while (true) {
        calls += current.metrics.calls;
        trace.push(...current.trace);
        reflectionContext.observations.push(...observationsOf(current.trace));
        reflectionContext.completedActions = mergeActions(
          reflectionContext.completedActions,
          actionsOf(current.trace),
        );

        const candidate: ReasoningResult = {
          ...current,
          trace: [...trace],
        };
        const verdict = parseVerdict(await critic(input, candidate));
        calls += 1;
        trace.push({
          type: "critique",
          content: verdict.feedback,
          approved: verdict.approved,
        });
        if (verdict.approved) {
          return {
            answer: current.answer,
            trace,
            metrics: { calls, latencyMs: Date.now() - started },
          };
        }

        reflectionContext.feedback.push(verdict.feedback);
        if (regenerations >= maxReflection) {
          return {
            answer: current.answer,
            trace,
            metrics: { calls, latencyMs: Date.now() - started },
          };
        }

        current = await strategy.run(input, {
          ...runOptions,
          maxReflection: undefined,
          reflectionContext,
        });
        regenerations += 1;
        if (regenerations === maxReflection) {
          calls += current.metrics.calls;
          trace.push(...current.trace);
          return {
            answer: current.answer,
            trace,
            metrics: { calls, latencyMs: Date.now() - started },
          };
        }
      }
    },
  };
}
