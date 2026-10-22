import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { ReasoningStrategy } from "../agents/types.js";
import { DomainError } from "../errors/domain-error.js";
import { errorHandler } from "../middleware/error-handler.js";
import { parseArenaRequest } from "./arena-controller.js";
import { createArenaController } from "./arena-controller.js";

test("validates the arena request and applies bounded optional fields", () => {
  assert.deepEqual(parseArenaRequest({ input: "Check alerts" }), {
    input: "Check alerts",
  });
  assert.deepEqual(
    parseArenaRequest({
      input: "Check alerts",
      strategies: ["reflect:react"],
      maxIterations: 4,
      maxReflection: 0,
    }),
    {
      input: "Check alerts",
      strategies: ["reflect:react"],
      maxIterations: 4,
      maxReflection: 0,
    },
  );
  assert.deepEqual(
    parseArenaRequest({
      input: "Check alerts",
      strategies: ["reflect:plan-and-execute"],
      maxReflection: 100,
    }),
    {
      input: "Check alerts",
      strategies: ["reflect:plan-and-execute"],
      maxReflection: 100,
    },
  );
});

test("rejects malformed arena request values", () => {
  for (const body of [
    {},
    { input: "  " },
    { input: "Check", strategies: [] },
    { input: "Check", strategies: ["unknown"] },
    { input: "Check", maxIterations: 0 },
    { input: "Check", maxIterations: 101 },
    { input: "Check", maxReflection: -1 },
    { input: "Check", maxReflection: 1.5 },
    { input: "Check", maxReflection: 101 },
    { input: "Check", strategies: ["reflect:react", "reflect:react"] },
  ]) {
    assert.throws(() => parseArenaRequest(body));
  }
});

test("HTTP arena validates requests and surfaces strategy failures", async () => {
  let called = false;
  const strategy: ReasoningStrategy = {
    name: "react",
    async run() {
      called = true;
      throw new DomainError("Model is not configured", "CONFIGURATION");
    },
  };
  const app = express();
  app.use(express.json());
  app.post("/arena", createArenaController([strategy]));
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const endpoint = `http://127.0.0.1:${address.port}/arena`;
  try {
    const invalidResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "Check", strategies: [] }),
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal(called, false);

    const failingResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "Check", strategies: ["react"] }),
    });
    assert.equal(failingResponse.status, 500);
    assert.deepEqual(await failingResponse.json(), {
      error: "Model is not configured",
    });
    assert.equal(called, true);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
});
