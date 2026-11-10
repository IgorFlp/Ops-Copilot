import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { parseAllowedOrigins, createCorsMiddleware, resolveAllowedOrigins } from "./cors.js";

async function withCorsServer(
  allowedOrigins: string[],
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(createCorsMiddleware({ allowedOrigins }));
  app.get("/ping", (_req, res) => {
    res.json({ ok: true });
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("parseAllowedOrigins splits, trims and drops empty entries", () => {
  assert.deepEqual(
    parseAllowedOrigins(" http://a.test , http://b.test ,, "),
    ["http://a.test", "http://b.test"],
  );
  assert.deepEqual(parseAllowedOrigins(undefined), []);
  assert.deepEqual(parseAllowedOrigins(""), []);
});

test("allowlisted origin receives Access-Control-Allow-Origin", async () => {
  await withCorsServer(["http://war-room.test"], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ping`, {
      headers: { Origin: "http://war-room.test" },
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://war-room.test",
    );
    assert.equal(response.headers.get("vary"), "Origin");
  });
});

test("non-allowlisted origin receives no Access-Control-Allow-Origin", async () => {
  await withCorsServer(["http://war-room.test"], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ping`, {
      headers: { Origin: "http://evil.test" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("vary"), "Origin");
  });
});

test("preflight returns 204 with methods and headers for allowlisted origin", async () => {
  await withCorsServer(["http://war-room.test"], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://war-room.test",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "http://war-room.test",
    );
    assert.match(
      response.headers.get("access-control-allow-methods") ?? "",
      /POST/,
    );
    assert.match(
      response.headers.get("access-control-allow-headers") ?? "",
      /Content-Type/i,
    );
  });
});

test("preflight for non-allowlisted origin has no allow-origin header", async () => {
  await withCorsServer(["http://war-room.test"], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/chat`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://evil.test",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("same-origin requests without an Origin header pass through", async () => {
  await withCorsServer([], async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ping`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("resolveAllowedOrigins prefers configured origins", () => {
  assert.deepEqual(
    resolveAllowedOrigins({
      CORS_ALLOWED_ORIGINS: "http://war-room.test",
      NODE_ENV: "production",
    }),
    ["http://war-room.test"],
  );
});

test("resolveAllowedOrigins defaults to the dev war room origin outside production", () => {
  assert.ok(resolveAllowedOrigins({}).includes("http://localhost:5173"));
});

test("resolveAllowedOrigins allows nothing in production without configuration", () => {
  assert.deepEqual(resolveAllowedOrigins({ NODE_ENV: "production" }), []);
});
