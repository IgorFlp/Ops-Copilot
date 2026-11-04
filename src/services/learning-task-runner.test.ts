import assert from "node:assert/strict";
import test from "node:test";
import { LearningTaskRunner } from "./learning-task-runner.js";

test("learning task runner catches failures and drains pending tasks", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const logs: string[] = [];
  const runner = new LearningTaskRunner((message) => logs.push(message));
  let completed = false;

  runner.schedule(async () => {
    await pending;
    completed = true;
    throw new Error("sensitive source content");
  });
  const draining = runner.drain();
  await Promise.resolve();
  assert.equal(completed, false);
  finish();
  await draining;

  assert.equal(completed, true);
  assert.deepEqual(logs, ["[opspilot] learning task failed"]);
});

test("learning task runner does not create an unhandled rejection", async () => {
  const logs: string[] = [];
  const runner = new LearningTaskRunner((message) => logs.push(message));
  runner.schedule(async () => {
    throw new Error("failure");
  });

  await runner.drain();
  assert.deepEqual(logs, ["[opspilot] learning task failed"]);
});
