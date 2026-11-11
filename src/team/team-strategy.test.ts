import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { createTeamStrategy } from "./team-strategy.js";
import { TEAM_MAX_HANDOFFS, type SupervisorDecision } from "./types.js";

function queued(decisions: SupervisorDecision[]) {
  let index = 0;
  return async () => {
    const decision = decisions[index] ?? decisions[decisions.length - 1];
    index += 1;
    return { decision, calls: 1 };
  };
}

test("returns a single coordinated answer assembled from role contributions", async () => {
  const team = createTeamStrategy({
    supervise: queued([
      { next: "analista", brief: "Diagnostique os alertas." },
      { next: "planejador", brief: "Proponha passos." },
      { next: "done", brief: "Resumo final do plantão." },
    ]),
    runRole: async ({ role }) => ({ content: `contribuição de ${role}`, calls: 1 }),
  });

  const result = await team.run("Investigue os alertas de checkout");

  assert.equal(result.answer, "Resumo final do plantão.");
  assert.ok(
    result.trace.some((event) =>
      event.content.includes("contribuição de analista"),
    ),
  );
  assert.ok(
    result.trace.some((event) =>
      event.content.includes("contribuição de planejador"),
    ),
  );
  assert.equal(result.metrics.calls, 5);
});

test("records one handoff per transfer with from, to, brief and node", async () => {
  const team = createTeamStrategy({
    supervise: queued([
      { next: "analista", brief: "Diagnostique." },
      { next: "executor", brief: "Abra o incidente." },
      { next: "done", brief: "Concluído." },
    ]),
    runRole: async ({ role }) => ({ content: `ok ${role}`, calls: 1 }),
  });

  const result = await team.run("Abra um incidente para checkout");
  const handoffs = result.trace
    .filter((event) => event.type === "handoff")
    .map((event) => ({ ...event, node: (event as { node?: string }).node }));

  assert.equal(handoffs.length, 2);
  assert.deepEqual(
    handoffs.map((event) => [event.from, event.to, event.node]),
    [
      ["supervisor", "analista", "team"],
      ["supervisor", "executor", "team"],
    ],
  );
  assert.equal(handoffs[0].brief, "Diagnostique.");
  assert.ok(handoffs[0].timestamp);
});

test("stops at the handoff ceiling and never reports a full success", async () => {
  const team = createTeamStrategy({
    supervise: async () => ({
      decision: { next: "analista", brief: "continue" },
      calls: 1,
    }),
    runRole: async () => ({ content: "observação", calls: 1 }),
  });

  const result = await team.run("loop infinito");
  const handoffs = result.trace.filter((event) => event.type === "handoff");

  assert.equal(handoffs.length, TEAM_MAX_HANDOFFS);
  assert.ok(
    result.trace.some(
      (event) =>
        event.type === "fallback" &&
        event.content.includes(String(TEAM_MAX_HANDOFFS)),
    ),
  );
  assert.ok(result.answer.length > 0);
});

test("fails explicitly when the ceiling is reached with no usable content", async () => {
  const team = createTeamStrategy({
    supervise: async () => ({
      decision: { next: "analista", brief: "continue" },
      calls: 1,
    }),
    runRole: async () => ({ content: "   ", calls: 1 }),
  });

  await assert.rejects(() => team.run("loop vazio"), DomainError);
});
