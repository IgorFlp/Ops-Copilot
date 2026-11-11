import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createModel } from "../agents/model.js";
import {
  aggregateModelUsage,
  extractPromptTokens,
} from "../agents/model-usage.js";
import { createOpsToolsForRequest } from "../agents/tools.js";
import type {
  ModelTokenUsage,
  TeamRoleId,
} from "../agents/types.js";
import type { IncidentServiceStore } from "../services/incident-service.js";
import { blackboardAsText } from "./blackboard.js";
import type { TeamBlackboard } from "./types.js";

export const READ_ONLY_TOOL_NAMES = [
  "list_alerts",
  "List_incidentes",
  "consultar_runbook",
  "check_provider_status",
] as const;

const readOnlyToolNames = new Set<string>(READ_ONLY_TOOL_NAMES);

export const ANALISTA_PROMPT = [
  "Voce e o ANALISTA do plantao. Sua unica funcao e produzir um diagnostico FACTUAL do estado atual.",
  "Use apenas ferramentas de leitura. Liste: alertas disparando (com data e severidade),",
  "incidentes recentes (abertos e resolvidos), runbooks relevantes, status dos provedores,",
  "janelas e fatos conhecidos do time.",
  "NAO proponha solucoes, NAO abra nem resolva nada.",
  "Formato: topicos telegraficos.",
  "Seja cetico: se um dado nao esta nas observacoes, nao afirme.",
].join("\n");

export const PLANEJADOR_PROMPT = [
  "Voce e o PLANEJADOR do plantao. Transforme os fatos conhecidos em um plano de acao claro,",
  "numerado e sequencial para o executor. Voce NAO usa ferramentas e NAO executa nada.",
  "Trabalhe apenas com o que esta no blackboard; nao invente dados.",
  "Nao inclua passos que abram ou resolvam incidentes a menos que o pedido do operador exija.",
].join("\n");

export const EXECUTOR_PROMPT = [
  "Voce e o EXECUTOR do plantao. Execute somente as acoes de incidente autorizadas pelo pedido",
  "do operador (abrir/resolver) e as leituras operacionais necessarias.",
  "Voce NAO pode ignorar nem contornar a autorizacao: se uma acao nao foi pedida explicitamente,",
  "nao a execute. Reporte o resultado factual de cada acao em topicos curtos.",
].join("\n");

export const ROLE_PROMPTS: Record<TeamRoleId, string> = {
  analista: ANALISTA_PROMPT,
  planejador: PLANEJADOR_PROMPT,
  executor: EXECUTOR_PROMPT,
};

export interface RoleRunInput {
  role: TeamRoleId;
  brief: string;
  blackboard: TeamBlackboard;
  request: string;
  userId?: string;
  store?: IncidentServiceStore;
}

export interface RoleOutput {
  content: string;
  calls: number;
  tokenUsage?: ModelTokenUsage;
}

export type RoleRunner = (input: RoleRunInput) => Promise<RoleOutput>;

/**
 * Tools visible to a role. Boundaries are enforced here so a role simply
 * cannot see a tool it may not use:
 * - analista: read-only tools only (never mutations, never forget_preference)
 * - planejador: no tools at all
 * - executor: read-only plus mutations, but mutations only when the request
 *   authorizes them (delegated to `createOpsToolsForRequest`); no bypass.
 */
export function roleTools(
  role: TeamRoleId,
  authorizationInput: string,
  store?: IncidentServiceStore,
  userId?: string,
): ReturnType<typeof createOpsToolsForRequest> {
  if (role === "planejador") return [];
  const tools = createOpsToolsForRequest(
    authorizationInput,
    store,
    [],
    fetch,
    userId,
  );
  if (role === "analista") {
    return tools.filter(({ name }) => readOnlyToolNames.has(name));
  }
  return tools.filter(({ name }) => name !== "forget_preference");
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

function roleUserContent(input: RoleRunInput): string {
  return [
    `Pedido do operador: ${input.request}`,
    `Brief do supervisor: ${input.brief}`,
    "",
    "Estado atual (blackboard):",
    blackboardAsText(input.blackboard) || "(vazio)",
  ].join("\n");
}

export function createDefaultRoleRunner(): RoleRunner {
  return async (input: RoleRunInput): Promise<RoleOutput> => {
    const prompt = ROLE_PROMPTS[input.role];
    const content = roleUserContent(input);
    const tools = roleTools(input.role, input.request, input.store, input.userId);

    if (tools.length === 0) {
      const response = await createModel().invoke([
        ["system", prompt],
        ["user", content],
      ]);
      return {
        content: messageText(response.content),
        calls: 1,
        tokenUsage: aggregateModelUsage([extractPromptTokens(response)]),
      };
    }

    const agent = createReactAgent({
      llm: createModel(),
      tools,
      prompt,
    });
    const result = (await agent.invoke(
      { messages: [new HumanMessage(content)] },
      { recursionLimit: 8 },
    )) as { messages: BaseMessage[] };
    const aiMessages = result.messages.filter(
      (message) => message.getType() === "ai",
    );
    const last = [...result.messages]
      .reverse()
      .find(
        (message) =>
          message.getType() === "ai" && messageText(message.content).length > 0,
      );
    return {
      content: last ? messageText(last.content) : "",
      calls: Math.max(1, aiMessages.length),
      tokenUsage: aggregateModelUsage(
        aiMessages.map((message) => extractPromptTokens(message)),
      ),
    };
  };
}
