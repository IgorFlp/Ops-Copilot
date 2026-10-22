import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DomainError } from "../errors/domain-error.js";
import { createModel } from "./model.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  ReflectionContext,
  StrategyRunOptions,
  TraceEvent,
} from "./types.js";
import { createOpsTools } from "./tools.js";

const DEFAULT_MAX_ITERATIONS = 8;
const MAX_ITERATIONS = 100;

type ReactAgentOutput = { messages: BaseMessage[] };
type ReactAgentInvoker = (
  input: string,
  maxIterations: number,
  reflectionContext?: ReflectionContext,
) => Promise<ReactAgentOutput>;

async function invokeAgent(
  input: string,
  maxIterations: number,
  reflectionContext?: ReflectionContext,
): Promise<ReactAgentOutput> {
  const retryContext = reflectionContext
    ? [
        "\n\nReflection retry context:",
        `Prior critique feedback:\n${reflectionContext.feedback.join("\n") || "(none)"}`,
        `Previously observed facts:\n${reflectionContext.observations.join("\n") || "(none)"}`,
        `Previously completed state-changing actions:\n${JSON.stringify(reflectionContext.completedActions)}`,
        "Do not repeat any successfully completed state-changing action listed above. Continue from the completed work and provide a revised answer.",
      ].join("\n")
    : "";
  const agent = createReactAgent({
    llm: createModel(),
    tools: [...createOpsTools(undefined, reflectionContext?.completedActions)],
    prompt:
      "Act as an operations assistant. Use operational tools when needed. " +
      "Provide concise user-facing summaries; never reveal private reasoning.",
  });
  return agent.invoke(
    { messages: [new HumanMessage(`${input}${retryContext}`)] },
    { recursionLimit: maxIterations * 2 + 1 },
  );
}

function messageText(content: BaseMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) =>
      typeof part === "string"
        ? part
        : "text" in part && typeof part.text === "string"
          ? part.text
          : "",
    )
    .filter(Boolean)
    .join("\n");
}

function buildTrace(messages: BaseMessage[]): TraceEvent[] {
  const trace: TraceEvent[] = [];
  const calls = new Map<
    string,
    { name: string; args: Record<string, unknown> }
  >();
  for (const message of messages) {
    if (
      message instanceof AIMessage &&
      (message.tool_calls?.length ?? 0) > 0
    ) {
      const toolCalls = message.tool_calls ?? [];
      for (const call of toolCalls) {
        if (call.id) {
          calls.set(call.id, { name: call.name, args: call.args });
        }
      }
      trace.push({
        type: "action",
        content: "Requested operational tool execution",
        tools: toolCalls.map((call) => call.name),
        args:
          toolCalls.length === 1
            ? toolCalls[0].args
            : Object.fromEntries(
                toolCalls.map((call) => [call.name, call.args]),
              ),
      });
    } else if (message instanceof ToolMessage) {
      const call = calls.get(message.tool_call_id);
      trace.push({
        type: "observation",
        content: messageText(message.content),
        ...(call ? { tools: [call.name], args: call.args } : {}),
      });
    } else if (
      message instanceof AIMessage &&
      !message.tool_calls?.length &&
      messageText(message.content)
    ) {
      trace.push({ type: "answer", content: messageText(message.content) });
    }
  }
  return trace;
}

export function createReactStrategy(
  invoker: ReactAgentInvoker = invokeAgent,
): ReasoningStrategy {
  return {
    name: "react",
    async run(
      input,
      options: StrategyRunOptions = {},
    ): Promise<ReasoningResult> {
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
      const { messages } = await invoker(
        input,
        maxIterations,
        options.reflectionContext,
      );
      const answer = [...messages]
        .reverse()
        .find(
          (message): message is AIMessage =>
            message instanceof AIMessage &&
            !message.tool_calls?.length &&
            messageText(message.content).length > 0,
        );
      if (!answer) {
        throw new Error("ReAct agent completed without a final answer");
      }

      return {
        answer: messageText(answer.content),
        trace: buildTrace(messages),
        metrics: {
          calls: messages.filter((message) => message instanceof AIMessage)
            .length,
          latencyMs: Date.now() - started,
        },
      };
    },
  };
}

export const reactStrategy = createReactStrategy();
