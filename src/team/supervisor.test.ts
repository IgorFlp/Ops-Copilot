import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import { parseSupervisorDecision, supervise } from "./supervisor.js";
import { createBlackboard, addEntry } from "./blackboard.js";

test("parses a valid supervisor decision from structured output", () => {
  const decision = parseSupervisorDecision({
    parsed: { next: "analista", brief: "Liste os alertas disparando." },
    raw: { usage_metadata: { prompt_tokens: 10 } },
  });
  assert.deepEqual(decision, {
    next: "analista",
    brief: "Liste os alertas disparando.",
  });
});

test("accepts done as the terminal actor with a final summary", () => {
  const decision = parseSupervisorDecision({
    next: "done",
    brief: "Resumo final do plantão.",
  });
  assert.equal(decision.next, "done");
  assert.equal(decision.brief, "Resumo final do plantão.");
});

test("rejects an unknown actor", () => {
  assert.throws(
    () => parseSupervisorDecision({ next: "manager", brief: "x" }),
    DomainError,
  );
});

test("rejects a missing actor", () => {
  assert.throws(
    () => parseSupervisorDecision({ brief: "x" }),
    DomainError,
  );
});

test("rejects an empty brief", () => {
  assert.throws(
    () => parseSupervisorDecision({ next: "analista", brief: "   " }),
    DomainError,
  );
});

test("supervise returns the parsed decision and passes the blackboard", async () => {
  let seenUser = "";
  const output = await supervise(
    {
      blackboard: addEntry(createBlackboard(), "analista", "3 alertas críticos."),
      request: "Investigue os alertas",
    },
    async (messages) => {
      seenUser = messages[1][1];
      return { parsed: { next: "planejador", brief: "Proponha passos." } };
    },
  );
  assert.equal(output.decision.next, "planejador");
  assert.equal(output.decision.brief, "Proponha passos.");
  assert.ok(seenUser.includes("3 alertas críticos."));
});
