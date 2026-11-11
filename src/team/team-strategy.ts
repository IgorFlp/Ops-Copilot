import { END, START, Annotation, StateGraph } from "@langchain/langgraph";
import { DomainError } from "../errors/domain-error.js";
import {
  combineModelUsage,
  unknownModelUsage,
} from "../agents/model-usage.js";
import {
  formatStrategyInput,
  type AttributedTraceEvent,
  type ChatStrategyInput,
  type ModelTokenUsage,
  type ReasoningResult,
  type ReasoningStrategy,
  type StrategyInput,
  type StrategyRunOptions,
  type TeamRoleId,
} from "../agents/types.js";
import type { IncidentServiceStore } from "../services/incident-service.js";
import { addEntry, createBlackboard, recordBrief } from "./blackboard.js";
import { createDefaultRoleRunner, type RoleOutput, type RoleRunInput } from "./roles.js";
import { supervise, type SupervisorInput, type SupervisorOutput } from "./supervisor.js";
import {
  TEAM_MAX_HANDOFFS,
  type SupervisorActor,
  type TeamBlackboard,
} from "./types.js";

export interface TeamDependencies {
  supervise(input: SupervisorInput): Promise<SupervisorOutput>;
  runRole(input: RoleRunInput): Promise<RoleOutput>;
}

const TeamState = Annotation.Root({
  input: Annotation<ChatStrategyInput>(),
  request: Annotation<string>(),
  blackboard: Annotation<TeamBlackboard>({
    reducer: (_current, update) => update,
    default: () => createBlackboard(),
  }),
  next: Annotation<SupervisorActor>({
    reducer: (_current, update) => update,
    default: () => "done" as SupervisorActor,
  }),
  brief: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
  handoffs: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  calls: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  tokenUsage: Annotation<ModelTokenUsage | undefined>({
    reducer: (_current, update) => update,
    default: () => undefined,
  }),
  trace: Annotation<AttributedTraceEvent[]>({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),
  answer: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => "",
  }),
});

type TeamStateType = typeof TeamState.State;

function now(): string {
  return new Date().toISOString();
}

function handoffEvent(to: TeamRoleId, brief: string): AttributedTraceEvent {
  return {
    node: "team",
    type: "handoff",
    content: `supervisor → ${to}: ${brief}`,
    from: "supervisor",
    to,
    brief,
    timestamp: now(),
  };
}

function ceilingEvent(): AttributedTraceEvent {
  return {
    node: "team",
    type: "fallback",
    content: `Teto de ${TEAM_MAX_HANDOFFS} handoffs atingido; retornando a melhor resposta disponivel.`,
    timestamp: now(),
  };
}

function contributionEvent(content: string): AttributedTraceEvent {
  return {
    node: "team",
    type: "observation",
    content,
    timestamp: now(),
  };
}

function bestEffort(blackboard: TeamBlackboard): string {
  for (let index = blackboard.entries.length - 1; index >= 0; index -= 1) {
    const content = blackboard.entries[index].content.trim();
    if (content.length > 0) return content;
  }
  return "";
}

export function createTeamStrategy(
  overrides: Partial<TeamDependencies> = {},
  store?: IncidentServiceStore,
): ReasoningStrategy {
  const deps: TeamDependencies = {
    supervise: overrides.supervise ?? ((input) => supervise(input)),
    runRole: overrides.runRole ?? createDefaultRoleRunner(),
  };

  return {
    name: "team",
    async run(
      input: StrategyInput,
      options: StrategyRunOptions = {},
    ): Promise<ReasoningResult> {
      const prompt = formatStrategyInput(input);
      const request = typeof input === "string" ? input : input.message;
      if (!prompt.trim()) {
        throw new DomainError("Input is required", "VALIDATION");
      }
      const userId = typeof input === "string" ? undefined : input.userId;
      void options;
      const started = Date.now();

      const supervisorNode = async (
        state: TeamStateType,
      ): Promise<Partial<TeamStateType>> => {
        const output = await deps.supervise({
          blackboard: state.blackboard,
          request,
        });
        const base = {
          calls: state.calls + output.calls,
          tokenUsage: combineModelUsage(
            state.tokenUsage,
            output.tokenUsage ?? unknownModelUsage(output.calls),
          ),
        };
        const { next, brief } = output.decision;
        if (next === "done") {
          return { ...base, next, brief, answer: brief };
        }
        if (state.handoffs >= TEAM_MAX_HANDOFFS) {
          return {
            ...base,
            next: "done" as SupervisorActor,
            brief,
            answer: bestEffort(state.blackboard),
            trace: [ceilingEvent()],
          };
        }
        return {
          ...base,
          next,
          brief,
          handoffs: state.handoffs + 1,
          blackboard: recordBrief(state.blackboard, brief),
          trace: [handoffEvent(next, brief)],
        };
      };

      const roleNode =
        (role: TeamRoleId) =>
        async (state: TeamStateType): Promise<Partial<TeamStateType>> => {
          const output = await deps.runRole({
            role,
            brief: state.brief,
            blackboard: state.blackboard,
            request,
            userId,
            store,
          });
          return {
            blackboard: addEntry(state.blackboard, role, output.content),
            calls: state.calls + output.calls,
            tokenUsage: combineModelUsage(
              state.tokenUsage,
              output.tokenUsage ?? unknownModelUsage(output.calls),
            ),
            trace: [contributionEvent(output.content)],
          };
        };

      const graph = new StateGraph(TeamState)
        .addNode("supervisor", supervisorNode)
        .addNode("analista", roleNode("analista"))
        .addNode("planejador", roleNode("planejador"))
        .addNode("executor", roleNode("executor"))
        .addEdge(START, "supervisor")
        .addConditionalEdges("supervisor", (state: TeamStateType) => state.next, {
          analista: "analista",
          planejador: "planejador",
          executor: "executor",
          done: END,
        })
        .addEdge("analista", "supervisor")
        .addEdge("planejador", "supervisor")
        .addEdge("executor", "supervisor")
        .compile();

      const initialState: ChatStrategyInput =
        typeof input === "string" ? { message: input, history: [] } : input;
      const result = (await graph.invoke(
        { input: initialState, request },
        { recursionLimit: TEAM_MAX_HANDOFFS * 2 + 2 },
      )) as TeamStateType;

      const answer = result.answer.trim() || bestEffort(result.blackboard);
      if (!answer) {
        throw new DomainError(
          "Team run finished without producing an answer",
          "INTERNAL",
        );
      }

      const finalEvent: AttributedTraceEvent = {
        type: "answer",
        node: "team",
        content: answer,
        timestamp: now(),
      };

      return {
        answer,
        trace: [...result.trace, finalEvent],
        metrics: { calls: result.calls, latencyMs: Date.now() - started },
        tokenUsage: result.tokenUsage,
      };
    },
  };
}

export const teamStrategy = createTeamStrategy();
