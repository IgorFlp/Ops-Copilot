import { createModel } from "./model.js";
import { extractPromptTokens } from "./model-usage.js";
import { errorDetail, logEvent } from "../lib/log.js";
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
  const started = Date.now();
  logEvent("summarizer.start", {
    messages: input.messages.length,
    hasPrevious: input.previousSummary !== null,
  });
  try {
    const response = await createModel().invoke(
      buildSummaryPrompt(input.previousSummary, input.messages),
    );
    const promptTokens = extractPromptTokens(response);
    const content = responseText(response.content);
    logEvent("summarizer.success", {
      durationMs: Date.now() - started,
      contentChars: content.length,
      promptTokens,
      finishReason: response.response_metadata?.finish_reason,
      usage: response.usage_metadata,
    });
    return {
      content,
      ...(promptTokens === undefined ? {} : { promptTokens }),
    };
  } catch (error) {
    logEvent("summarizer.failure", {
      durationMs: Date.now() - started,
      error: errorDetail(error),
    });
    throw error;
  }
}
