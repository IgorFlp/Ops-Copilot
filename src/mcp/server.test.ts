import assert from "node:assert/strict";
import type { Stream } from "node:stream";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { seedOperationalData } from "../../scripts/seed.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { createOpsMcpServer } from "./server.js";

async function withMcpClient(
  run: (client: Client, store: SqliteOpsStore) => Promise<void>,
) {
  const store = new SqliteOpsStore(".memory");
  const server = createOpsMcpServer(store);
  const client = new Client({ name: "opspilot-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  try {
    await seedOperationalData(store);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client, store);
  } finally {
    await client.close();
    await server.close();
    store.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readTextResult(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new TypeError("MCP tool result did not contain content");
  }
  const textItem = result.content.find(
    (item) => isRecord(item) && item.type === "text",
  );
  if (!isRecord(textItem) || typeof textItem.text !== "string") {
    throw new TypeError("MCP tool result did not contain text");
  }
  return JSON.parse(textItem.text) as unknown;
}

function waitForStreamText(
  stream: Stream,
  expected: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      stream.off("data", onData);
      reject(new Error(`Timed out waiting for stderr to contain: ${expected}`));
    }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timeout);
        stream.off("data", onData);
        resolve(output);
      }
    };
    stream.on("data", onData);
  });
}

test("MCP server identifies as opspilot and lists alerts and incidents", async () => {
  await withMcpClient(async (client, store) => {
    const serverInfo = client.getServerVersion();
    assert.equal(serverInfo?.name, "opspilot");

    const result = await client.listTools();
    assert.deepEqual(
      result.tools.map(({ name }) => name).sort(),
      ["list_alerts", "open_incidents", "resolve_incident"],
    );

    const alerts = readTextResult(
      await client.callTool({ name: "list_alerts", arguments: {} }),
    );
    assert.equal(Array.isArray(alerts), true);
    assert.equal((alerts as unknown[]).length, 3);

    const open = await store.openIncident({
      title: "Checkout degradation",
      service: "checkout",
      severity: "high",
    });
    const resolved = await store.openIncident({
      title: "Payment delay",
      service: "payments",
      severity: "medium",
    });
    await store.resolveIncident(resolved.id);

    const openIncidents = readTextResult(
      await client.callTool({ name: "open_incidents", arguments: {} }),
    );
    const resolvedIncidents = readTextResult(
      await client.callTool({
        name: "open_incidents",
        arguments: { status: "resolved" },
      }),
    );
    const allIncidents = readTextResult(
      await client.callTool({
        name: "open_incidents",
        arguments: { status: "all" },
      }),
    );

    assert.deepEqual(
      (openIncidents as Array<{ id: number }>).map(({ id }) => id),
      [open.id],
    );
    assert.deepEqual(
      (resolvedIncidents as Array<{ id: number }>).map(({ id }) => id),
      [resolved.id],
    );
    assert.equal((allIncidents as unknown[]).length, 2);
  });
});

test("npm mcp command serves protocol over stdio without logging to stdout", async () => {
  const command =
    process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run --silent mcp"]
      : ["run", "--silent", "mcp"];
  const transport = new StdioClientTransport({
    command,
    args,
    cwd: process.cwd(),
    env: { OPSPILOT_DB: ":memory:" },
    stderr: "pipe",
  });
  const client = new Client({ name: "opspilot-stdio-test", version: "1.0.0" });
  const stderr = transport.stderr;
  assert.ok(stderr);
  const readyMessage = waitForStreamText(
    stderr,
    "OpsPilot MCP server ready (stdio)",
    10_000,
  );

  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name, "opspilot");
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map(({ name }) => name).sort(),
      ["list_alerts", "open_incidents", "resolve_incident"],
    );
    const diagnosticOutput = await readyMessage;
    assert.match(diagnosticOutput, /OpsPilot MCP server ready \(stdio\)/);
  } finally {
    await client.close();
  }
});

test("MCP alert listing accepts all existing status filters", async () => {
  await withMcpClient(async (client) => {
    const counts = new Map<string, number>();
    for (const status of ["firing", "resolved", "all"] as const) {
      const alerts = readTextResult(
        await client.callTool({
          name: "list_alerts",
          arguments: { status },
        }),
      );
      counts.set(status, (alerts as unknown[]).length);
    }

    assert.deepEqual([...counts], [
      ["firing", 3],
      ["resolved", 3],
      ["all", 6],
    ]);

    const invalidStatus = await client.callTool({
      name: "list_alerts",
      arguments: { status: "unknown" },
    });
    assert.equal(
      "isError" in invalidStatus && invalidStatus.isError,
      true,
    );
  });
});

test("MCP resolves incidents and reports failures explicitly", async () => {
  await withMcpClient(async (client, store) => {
    const incident = await store.openIncident({
      title: "Checkout degradation",
      service: "checkout",
      severity: "critical",
    });

    const resolved = readTextResult(
      await client.callTool({
        name: "resolve_incident",
        arguments: { id: incident.id },
      }),
    );
    assert.equal(
      (resolved as { id: number; status: string }).id,
      incident.id,
    );
    assert.equal((resolved as { status: string }).status, "resolved");
    const visible = readTextResult(
      await client.callTool({
        name: "open_incidents",
        arguments: { status: "resolved" },
      }),
    );
    assert.deepEqual(
      (visible as Array<{ id: number }>).map(({ id }) => id),
      [incident.id],
    );

    const invalid = await client.callTool({
      name: "resolve_incident",
      arguments: { id: -1 },
    });
    const unknown = await client.callTool({
      name: "resolve_incident",
      arguments: { id: 999_999 },
    });
    const repeated = await client.callTool({
      name: "resolve_incident",
      arguments: { id: incident.id },
    });

    assert.equal("isError" in invalid && invalid.isError, true);
    assert.equal("isError" in unknown && unknown.isError, true);
    assert.equal("isError" in repeated && repeated.isError, true);
  });
});
