import { DomainError } from "../errors/domain-error.js";
import {
  aggregateModelUsage,
  extractPromptTokens,
} from "../agents/model-usage.js";
import { createModel } from "../agents/model.js";
import type { ModelTokenUsage } from "../agents/types.js";
import { blackboardAsText } from "./blackboard.js";
import {
  supervisorDecisionSchema,
  type SupervisorDecision,
  type TeamBlackboard,
} from "./types.js";

export const SUPERVISOR_PROMPT = [
  "Voce e o SUPERVISOR do plantao. Voce NAO executa nada diretamente:",
  "apenas decide qual papel deve agir a seguir e escreve uma instrucao de trabalho curta para ele.",
  "",
  "Papeis disponiveis:",
  "- analista: leitura factual do estado atual (alertas, incidentes, runbooks, status). Nao propoe nem executa.",
  "- planejador: transforma os fatos em um plano de acao. Nao usa ferramentas.",
  "- executor: executa acoes de incidente autorizadas (abrir/resolver) e leituras operacionais. Sem bypass de autorizacao.",
  "",
  'Responda SOMENTE com um objeto JSON {"next": "analista|planejador|executor|done", "brief": "..."}.',
  "Use next=done apenas quando houver informacao suficiente para concluir; nesse caso brief deve ser o resumo final para o operador.",
  "Cada handoff deve avancar o trabalho: nao repita um papel sem um novo objetivo.",
].join("\n");

export interface SupervisorInput {
  blackboard: TeamBlackboard;
  request: string;
}

export interface SupervisorOutput {
  decision: SupervisorDecision;
  calls: number;
  tokenUsage?: ModelTokenUsage;
}

export type SupervisorMessages = ReadonlyArray<[string, string]>;
export type SupervisorInvoker = (
  messages: SupervisorMessages,
) => Promise<unknown>;

function candidateOf(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    "parsed" in value &&
    (value as { parsed?: unknown }).parsed !== undefined &&
    (value as { parsed?: unknown }).parsed !== null
  ) {
    return (value as { parsed: unknown }).parsed;
  }
  return value;
}

export function parseSupervisorDecision(value: unknown): SupervisorDecision {
  const parsed = supervisorDecisionSchema.safeParse(candidateOf(value));
  if (!parsed.success) {
    throw new DomainError(
      `Supervisor returned invalid structured output: ${parsed.error.message}`,
      "INTERNAL",
    );
  }
  const brief = parsed.data.brief.trim();
  if (brief.length === 0) {
    throw new DomainError(
      "Supervisor returned an empty brief",
      "INTERNAL",
    );
  }
  return { next: parsed.data.next, brief };
}

export async function defaultSupervisorInvoke(
  messages: SupervisorMessages,
): Promise<unknown> {
  const supervisor = createModel().withStructuredOutput(
    supervisorDecisionSchema,
    { includeRaw: true },
  );
  return supervisor.invoke(messages as [string, string][]);
}

export async function supervise(
  input: SupervisorInput,
  invoke: SupervisorInvoker = defaultSupervisorInvoke,
): Promise<SupervisorOutput> {
  const messages: SupervisorMessages = [
    ["system", SUPERVISOR_PROMPT],
    [
      "user",
      [
        `Pedido do operador: ${input.request}`,
        "",
        "Estado atual (blackboard):",
        blackboardAsText(input.blackboard) || "(vazio)",
      ].join("\n"),
    ],
  ];
  const response = await invoke(messages);
  const decision = parseSupervisorDecision(response);
  return {
    decision,
    calls: 1,
    tokenUsage: aggregateModelUsage([extractPromptTokens(response)]),
  };
}
