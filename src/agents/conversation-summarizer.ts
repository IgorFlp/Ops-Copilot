import { createModel } from "./model.js";
import { extractPromptTokens } from "./model-usage.js";
import type { StrategyHistoryMessage } from "./types.js";
import { buildSummaryPrompt } from "../context/history-summary.js";

export interface ConversationSummaryInput {
  previousSummary: string | null;
  messages: readonly StrategyHistoryMessage[];
}

export interface ConversationSummaryOutput {
  content: string;
  promptTokens?: number;
}

export interface ConversationSummarizer {
  summarize(input: ConversationSummaryInput): Promise<ConversationSummaryOutput>;
}

function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const text = value
      .map((block) => {
        if (
          typeof block === "object" &&
          block !== null &&
          "text" in block &&
          typeof block.text === "string"
        ) {
          return block.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) return text;
  }
  throw new Error("Conversation summarizer returned no text");
}

export async function summarizeConversation(
  input: ConversationSummaryInput,
): Promise<ConversationSummaryOutput> {
  const response = await createModel({ maxTokens: 256 }).invoke(
    buildSummaryPrompt(input.previousSummary, input.messages),
  );
  const promptTokens = extractPromptTokens(response);
  return {
    content: responseText(response.content),
    ...(promptTokens === undefined ? {} : { promptTokens }),
  };
}
