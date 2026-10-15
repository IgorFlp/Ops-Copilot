import { DomainError } from "../errors/domain-error.js";
import { ChatOpenAI } from "@langchain/openai";

export function createModel(): ChatOpenAI {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.OPENROUTER_MODEL?.trim();
  if (!apiKey || !model) {
    throw new DomainError(
      "OPENROUTER_API_KEY and OPENROUTER_MODEL must be configured",
      "CONFIGURATION",
    );
  }

  return new ChatOpenAI({
    model,
    apiKey,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0,
  });
}
