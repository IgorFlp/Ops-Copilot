import { z } from "zod";
import type { TeamRoleId, TraceEvent } from "../agents/types.js";

/**
 * Maximum number of handoffs a single team run may perform. Fixed by the
 * feature request ("teto 8").
 */
export const TEAM_MAX_HANDOFFS = 8;

/**
 * Structured decision produced by the supervisor. `next` is the next actor to
 * engage (a role, or `done` to conclude); `brief` is the work instruction for
 * the next actor, or the final summary when `next` is `done`.
 */
export const supervisorDecisionSchema = z.object({
  next: z.enum(["analista", "planejador", "executor", "done"]),
  brief: z
    .string()
    .describe(
      "Instrução de trabalho para o próximo papel (nó) ou resumo final se done",
    ),
});

export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;

/** The set of actors a supervisor may select. */
export type SupervisorActor = SupervisorDecision["next"];

/** The role currently engaged by the supervisor. */
export type HandoffTarget = TeamRoleId;

/** A `handoff` trace event records one control transfer. */
export interface HandoffTraceEvent extends TraceEvent {
  type: "handoff";
  from: string;
  to: string;
  brief: string;
}

/** A single contribution appended to the shared working state. */
export interface BlackboardEntry {
  role: TeamRoleId;
  content: string;
  at: string;
}

/** Shared working state scoped to a single team run. */
export interface TeamBlackboard {
  entries: BlackboardEntry[];
  historyBriefs: string[];
}

/** Snapshot of a run, useful for tests and callers. */
export interface TeamRunState {
  blackboard: TeamBlackboard;
  next: SupervisorActor;
  brief: string;
  handoffs: number;
  answer: string;
  incomplete: boolean;
}
