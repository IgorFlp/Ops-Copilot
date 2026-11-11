import type { TeamRoleId } from "../agents/types.js";
import type { BlackboardEntry, TeamBlackboard } from "./types.js";

/** Create an empty blackboard scoped to a single team run. */
export function createBlackboard(): TeamBlackboard {
  return { entries: [], historyBriefs: [] };
}

/** Append a role contribution and return the updated blackboard. */
export function addEntry(
  blackboard: TeamBlackboard,
  role: TeamRoleId,
  content: string,
  at: string = new Date().toISOString(),
): TeamBlackboard {
  const entry: BlackboardEntry = { role, content, at };
  return {
    entries: [...blackboard.entries, entry],
    historyBriefs: [...blackboard.historyBriefs],
  };
}

/** Record a brief passed to a role and return the updated blackboard. */
export function recordBrief(
  blackboard: TeamBlackboard,
  brief: string,
): TeamBlackboard {
  return {
    entries: [...blackboard.entries],
    historyBriefs: [...blackboard.historyBriefs, brief],
  };
}

/** Render the blackboard as plain text for a model prompt. */
export function blackboardAsText(blackboard: TeamBlackboard): string {
  if (blackboard.entries.length === 0) return "";
  return blackboard.entries
    .map(
      (entry, index) =>
        `${index + 1}. [${entry.role}] ${entry.content}`,
    )
    .join("\n");
}
