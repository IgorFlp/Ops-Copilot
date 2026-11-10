import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AddressInfo } from "node:net";
import { createWebStaticRouter, registerWebStatic } from "./middleware/web-static.js";

function createDistDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "opspilot-web-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><div>app</div>");
  mkdirSync(path.join(dir, "assets"));
  writeFileSync(path.join(dir, "assets", "app.js"), "console.log('app');");
  return dir;
}

async function withWebServer(
  distDir: string,
  run: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use("/opspilot", createWebStaticRouter(distDir));
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

test("serves the SPA index at the base path", async () => {
  const dir = createDistDir();
  try {
    await withWebServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/opspilot/`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /app/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("falls back to index.html for deep links without an extension", async () => {
  const dir = createDistDir();
  try {
    await withWebServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/opspilot/chat`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /app/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("serves real assets", async () => {
  const dir = createDistDir();
  try {
    await withWebServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/opspilot/assets/app.js`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /console\.log/);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("does not fall back for missing files with an extension", async () => {
  const dir = createDistDir();
  try {
    await withWebServer(dir, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/opspilot/missing.js`);
      assert.equal(response.status, 404);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("registerWebStatic returns null when the build is absent", () => {
  const missing = path.join(tmpdir(), "opspilot-web-missing-dir");
  assert.equal(registerWebStatic(missing), null);
});
