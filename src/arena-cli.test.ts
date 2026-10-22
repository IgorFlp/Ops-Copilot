import assert from "node:assert/strict";
import test from "node:test";
import {
  formatArenaResults,
  parseArenaCliArguments,
} from "./arena-cli.js";

test("parses input, one strategy, and iteration and reflection limits", () => {
  assert.deepEqual(
    parseArenaCliArguments([
      "What alerts are firing?",
      "--strategies",
      "react",
      "--max-iterations",
      "3",
      "--max-reflection",
      "2",
    ]),
    {
      input: "What alerts are firing?",
      strategies: ["react"],
      maxIterations: 3,
      maxReflection: 2,
    },
  );
});

test("defaults strategy selection and joins unquoted input words", () => {
  assert.deepEqual(parseArenaCliArguments(["Inspect", "the", "alerts"]), {
    input: "Inspect the alerts",
  });
});

test("recovers npm-parsed flags from lifecycle config and trailing values", () => {
  assert.deepEqual(
    parseArenaCliArguments(
      ["Investigate alerts", "plan-and-execute", "4"],
      { strategies: "true", maxIterations: "true" },
    ),
    {
      input: "Investigate alerts",
      strategies: ["plan-and-execute"],
      maxIterations: 4,
    },
  );
});

test("accepts reflected strategies and a zero reflection bound", () => {
  assert.deepEqual(
    parseArenaCliArguments([
      "Investigate alerts",
      "--strategies",
      "reflect:react,reflect:plan-and-execute",
      "--max-reflection",
      "0",
    ]),
    {
      input: "Investigate alerts",
      strategies: ["reflect:react", "reflect:plan-and-execute"],
      maxReflection: 0,
    },
  );
});

test("accepts comma-separated strategies and rejects invalid CLI arguments", () => {
  assert.deepEqual(
    parseArenaCliArguments([
      "Inspect alerts",
      "--strategies",
      "react,plan-and-execute",
    ]).strategies,
    ["react", "plan-and-execute"],
  );
  assert.throws(() => parseArenaCliArguments([]), /Usage:/);
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--strategies", ""]),
    /at least one strategy/,
  );
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--strategies", "unknown"]),
    /Unknown strategy/,
  );
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--max-iterations", "0"]),
    /integer from 1 to 100/,
  );
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--max-reflection", "-1"]),
    /integer from 0 to 100/,
  );
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--max-reflection", "1.5"]),
    /integer from 0 to 100/,
  );
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--max-reflection", "101"]),
    /integer from 0 to 100/,
  );
  assert.throws(
    () => parseArenaCliArguments(["Inspect", "--unrecognized"]),
    /Unknown option/,
  );
});

test("formats answer, trace, and metrics as readable JSON", () => {
  const output = formatArenaResults([
    {
      strategy: "react",
      result: {
        answer: "Two alerts are firing.",
        trace: [{ type: "answer", content: "Two alerts are firing." }],
        metrics: { calls: 2, latencyMs: 125 },
      },
    },
  ]);
  assert.deepEqual(JSON.parse(output), [
    {
      strategy: "react",
      result: {
        answer: "Two alerts are firing.",
        trace: [{ type: "answer", content: "Two alerts are firing." }],
        metrics: { calls: 2, latencyMs: 125 },
      },
    },
  ]);
});
