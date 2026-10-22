import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../errors/domain-error.js";
import {
  ReasoningResult,
  ReasoningStrategy,
  ReflectionContext,
  StrategyRunOptions,
} from "./types.js";
import { withReflection } from "./reflection.js";

function result(
  answer: string,
  calls = 1,
  trace: ReasoningResult["trace"] = [
    { type: "observation", content: `Evidence for ${answer}` },
    { type: "answer", content: answer },
  ],
): ReasoningResult {
  return { answer, trace, metrics: { calls, latencyMs: 3 } };
}

function strategy(
  run: (
    input: string,
    options?: StrategyRunOptions,
  ) => Promise<ReasoningResult>,
  name = "fixture",
): ReasoningStrategy {
  return { name, run };
}

test("returns an approved initial answer and evaluates request and observations", async () => {
  const calls: Array<[string, ReasoningResult]> = [];
  let runs = 0;
  const reflected = withReflection(
    strategy(async () => {
      runs += 1;
      return result("The answer");
    }),
    {
      critic: async (input, candidate) => {
        calls.push([input, candidate]);
        return { approved: true, feedback: "Evidence supports the answer." };
      },
    },
  );

  const output = await reflected.run("Check production");

  assert.equal(runs, 1);
  assert.equal(calls[0][0], "Check production");
  assert.deepEqual(calls[0][1].trace[0], {
    type: "observation",
    content: "Evidence for The answer",
  });
  assert.equal(output.answer, "The answer");
  assert.equal(output.metrics.calls, 2);
});

test("regenerates with critique feedback and passes prior observations", async () => {
  const contexts: Array<ReflectionContext | undefined> = [];
  let run = 0;
  const reflected = withReflection(
    strategy(async (_input, options) => {
      contexts.push(
        options?.reflectionContext
          ? structuredClone(options.reflectionContext)
          : undefined,
      );
      run += 1;
      return result(
        `Answer ${run}`,
        2,
        [{ type: "observation", content: `Observation ${run}` }],
      );
    }),
    {
      critic: async (_input, candidate) => ({
        approved: candidate.answer === "Answer 2",
        feedback: "Include the missing observation.",
      }),
    },
  );

  const output = await reflected.run("Investigate");

  assert.equal(output.answer, "Answer 2");
  assert.equal(run, 2);
  assert.deepEqual(contexts[0], undefined);
  assert.deepEqual(contexts[1], {
    feedback: ["Include the missing observation."],
    observations: ["Observation 1"],
    completedActions: [],
  });
});

test("critiques empty evidence without inventing observations", async () => {
  let observations: string[] | undefined;
  const reflected = withReflection(
    strategy(async () =>
      result("Unverified answer", 1, [{ type: "answer", content: "Unverified answer" }]),
    ),
    {
      critic: async (_input, candidate) => {
        observations = candidate.trace
          .filter(({ type }) => type === "observation")
          .map(({ content }) => content);
        return { approved: true, feedback: "No observations were available." };
      },
    },
  );

  await reflected.run("Answer the question");
  assert.deepEqual(observations, []);
});

test("defaults to two regenerations and returns the final one without a third critique", async () => {
  let runs = 0;
  let critiques = 0;
  const reflected = withReflection(
    strategy(async () => {
      runs += 1;
      return result(`Answer ${runs}`);
    }),
    {
      critic: async () => {
        critiques += 1;
        return { approved: false, feedback: `Correction ${critiques}` };
      },
    },
  );

  const output = await reflected.run("Investigate");

  assert.equal(output.answer, "Answer 3");
  assert.equal(runs, 3);
  assert.equal(critiques, 2);
  assert.equal(output.metrics.calls, 5);
  assert.deepEqual(
    output.trace
      .filter(({ type }) => type === "critique")
      .map(({ approved, content }) => [approved, content]),
    [
      [false, "Correction 1"],
      [false, "Correction 2"],
    ],
  );
  assert.deepEqual(
    output.trace.map(({ type }) => type),
    [
      "observation",
      "answer",
      "critique",
      "observation",
      "answer",
      "critique",
      "observation",
      "answer",
    ],
  );
});

test("zero reflection limit critiques once and does not regenerate", async () => {
  let runs = 0;
  let critiques = 0;
  const reflected = withReflection(
    strategy(async () => {
      runs += 1;
      return result("Initial answer");
    }),
    {
      maxReflection: 0,
      critic: async () => {
        critiques += 1;
        return { approved: false, feedback: "Revise this." };
      },
    },
  );

  const output = await reflected.run("Investigate");
  assert.equal(output.answer, "Initial answer");
  assert.equal(runs, 1);
  assert.equal(critiques, 1);
  assert.equal(output.metrics.calls, 2);
});

test("does not critique after the final allowed regeneration", async () => {
  let runs = 0;
  let critiques = 0;
  const reflected = withReflection(
    strategy(async () => {
      runs += 1;
      return result(`Candidate ${runs}`, 2);
    }),
    {
      maxReflection: 1,
      critic: async () => {
        critiques += 1;
        return { approved: false, feedback: "Try once." };
      },
    },
  );

  const output = await reflected.run("Investigate");
  assert.equal(output.answer, "Candidate 2");
  assert.equal(runs, 2);
  assert.equal(critiques, 1);
  assert.equal(output.metrics.calls, 5);
});

test("measures elapsed time across strategy attempts and critic calls", async () => {
  let runs = 0;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 12));
  const reflected = withReflection(
    strategy(async () => {
      await wait();
      runs += 1;
      return result(`Candidate ${runs}`);
    }),
    {
      maxReflection: 1,
      critic: async () => {
        await wait();
        return { approved: false, feedback: "Regenerate once." };
      },
    },
  );

  const output = await reflected.run("Investigate");
  assert.equal(runs, 2);
  assert.ok(output.metrics.latencyMs >= 30);
});

test("rejects invalid limits before strategy or critic execution", async () => {
  for (const maxReflection of [-1, 1.5, 101, Number.NaN]) {
    let invoked = false;
    const reflected = withReflection(
      strategy(async () => {
        invoked = true;
        return result("unused");
      }),
      {
        maxReflection,
        critic: async () => {
          invoked = true;
          return { approved: true, feedback: "" };
        },
      },
    );

    await assert.rejects(
      reflected.run("Investigate"),
      (error: unknown) =>
        error instanceof DomainError && error.code === "VALIDATION",
    );
    assert.equal(invoked, false);
  }
});

test("surfaces malformed critic output and strategy or critic errors", async () => {
  const base = strategy(async () => result("Candidate"));
  const malformed = withReflection(base, {
    critic: async () => ({ approved: "yes", feedback: "invalid" }) as never,
  });
  await assert.rejects(malformed.run("Investigate"), /Critic output failed/);

  const strategyFailure = new Error("strategy failed");
  await assert.rejects(
    withReflection(
      strategy(async () => {
        throw strategyFailure;
      }),
      { critic: async () => ({ approved: true, feedback: "" }) },
    ).run("Investigate"),
    strategyFailure,
  );

  const criticFailure = new Error("critic failed");
  await assert.rejects(
    withReflection(base, {
      critic: async () => {
        throw criticFailure;
      },
    }).run("Investigate"),
    criticFailure,
  );
});
