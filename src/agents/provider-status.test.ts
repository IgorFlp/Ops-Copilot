import assert from "node:assert/strict";
import test from "node:test";
import { fetchProviderStatus } from "./provider-status.js";

function statusResponse(indicator: string, description: string): Response {
  return new Response(
    JSON.stringify({ status: { indicator, description } }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

test("fetches GitHub status by default and returns a compact one-line result", async () => {
  const requests: string[] = [];
  const result = await fetchProviderStatus(undefined, async (input) => {
    requests.push(String(input));
    return statusResponse("minor", "Partial outage");
  });

  assert.deepEqual(requests, [
    "https://www.githubstatus.com/api/v2/status.json",
  ]);
  assert.equal(result, "github está minor — Partial outage");
  assert.equal(result.includes("\n"), false);
});

test("fetches Cloudflare status when selected", async () => {
  const requests: string[] = [];
  const result = await fetchProviderStatus("cloudflare", async (input) => {
    requests.push(String(input));
    return statusResponse("none", "All Systems Operational");
  });

  assert.deepEqual(requests, [
    "https://www.cloudflarestatus.com/api/v2/status.json",
  ]);
  assert.equal(result, "cloudflare está none — All Systems Operational");
});

test("retries once after a timeout and returns a readable result after recovery", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("github", async (_input, init) => {
    calls += 1;
    assert.ok(init?.signal instanceof AbortSignal);
    if (calls === 1) {
      const error = new Error("The operation timed out");
      error.name = "TimeoutError";
      throw error;
    }
    return statusResponse("none", "All Systems Operational");
  });

  assert.equal(calls, 2);
  assert.equal(result, "github está none — All Systems Operational");
});

test("retries once after a network failure", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("github", async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return statusResponse("none", "All Systems Operational");
  });

  assert.equal(calls, 2);
  assert.equal(result, "github está none — All Systems Operational");
});

test("retries once after a server error", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("cloudflare", async () => {
    calls += 1;
    if (calls === 1) return new Response(null, { status: 503 });
    return statusResponse("none", "All Systems Operational");
  });

  assert.equal(calls, 2);
  assert.equal(result, "cloudflare está none — All Systems Operational");
});

test("returns a readable failure after the second transient failure", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("github", async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  });

  assert.equal(calls, 2);
  assert.match(result, /Não consegui consultar o status de github/);
  assert.match(result, /Use os alertas internos/);
  assert.equal(result.includes("\n"), false);
});

test("does not retry malformed status responses", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("github", async () => {
    calls += 1;
    return new Response(JSON.stringify({ status: { indicator: 1 } }), {
      status: 200,
    });
  });

  assert.equal(calls, 1);
  assert.match(result, /resposta de status inválida/);
});

test("does not retry invalid JSON responses", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("github", async () => {
    calls += 1;
    return new Response("{", { status: 200 });
  });

  assert.equal(calls, 1);
  assert.match(result, /resposta JSON inválida/);
});

test("does not retry non-server HTTP errors", async () => {
  let calls = 0;
  const result = await fetchProviderStatus("cloudflare", async () => {
    calls += 1;
    return new Response(null, { status: 429 });
  });

  assert.equal(calls, 1);
  assert.match(result, /HTTP 429/);
});
