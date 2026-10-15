import assert from "node:assert/strict";
import test from "node:test";
import { TraceEvent } from "../agents/types.js";
import { formatTrace } from "./trace-format.js";

test("formats all supported event types deterministically and in order", () => {
  const events: TraceEvent[] = [
    { type: "thought", content: "Checking alert status" },
    { type: "plan", content: "Review firing alerts" },
    {
      type: "action",
      content: "Calling alert tool",
      tools: ["list_alerts"],
      args: { status: "firing" },
    },
    { type: "observation", content: "One alert is firing" },
    { type: "critique", content: "The alert is relevant" },
    { type: "answer", content: "One alert is firing." },
  ];

  const expected = [
    "01 thought: Checking alert status",
    "02 plan: Review firing alerts",
    '03 action: Calling alert tool tools=["list_alerts"] args={"status":"firing"}',
    "04 observation: One alert is firing",
    "05 critique: The alert is relevant",
    "06 answer: One alert is firing.",
  ].join("\n");
  assert.equal(formatTrace(events), expected);
  assert.equal(formatTrace(events), formatTrace(events));
});
