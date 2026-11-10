import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DomainError } from "../errors/domain-error.js";
import { errorDetail, logEvent } from "../lib/log.js";
import { createIncidentService } from "../services/incident-service.js";
import type { IncidentServiceStore } from "../services/incident-service.js";
import {
  closeDefaultOpsStore,
  getDefaultOpsStore,
} from "../store/default-ops-store.js";
import {
  listAlertsInputSchema,
  listIncidentsInputSchema,
  resolveIncidentInputSchema,
} from "../agents/tool-schemas.js";

type ToolHandler = () => Promise<unknown>;

function failureMessage(error: unknown): string {
  if (error instanceof DomainError) {
    switch (error.code) {
      case "VALIDATION":
        return "Invalid tool input.";
      case "NOT_FOUND":
        return "The requested operational record was not found.";
      case "CONFLICT":
        return "The incident cannot be changed in its current state.";
      default:
        return "The operational request could not be completed.";
    }
  }
  return "The operational request could not be completed.";
}

async function handleToolCall(
  toolName: string,
  handler: ToolHandler,
): Promise<{ content: [{ type: "text"; text: string }]; isError?: true }> {
  const started = Date.now();
  logEvent("mcp.tool.start", { tool: toolName });
  try {
    const result = await handler();
    logEvent("mcp.tool.success", {
      tool: toolName,
      durationMs: Date.now() - started,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (error) {
    logEvent("mcp.tool.failure", {
      tool: toolName,
      durationMs: Date.now() - started,
      error: errorDetail(error),
    });
    return {
      content: [{ type: "text", text: failureMessage(error) }],
      isError: true,
    };
  }
}

export function createOpsMcpServer(
  store: IncidentServiceStore = getDefaultOpsStore(),
): McpServer {
  const service = createIncidentService(store);
  const server = new McpServer({
    name: "opspilot",
    version: "1.0.0",
  });

  server.registerTool(
    "list_alerts",
    {
      description:
        "List monitoring alerts by status. Defaults to firing. This operation is read-only.",
      inputSchema: listAlertsInputSchema.shape,
    },
    async ({ status }) =>
      handleToolCall("list_alerts", () => service.listAlerts(status)),
  );

  server.registerTool(
    "open_incidents",
    {
      description:
        "List incidents by status. Defaults to open. This operation is read-only and does not create incidents.",
      inputSchema: listIncidentsInputSchema.shape,
    },
    async ({ status }) =>
      handleToolCall("open_incidents", () => service.listIncidents(status)),
  );

  server.registerTool(
    "resolve_incident",
    {
      description:
        "Resolve an existing open incident by its positive numeric identifier. This operation changes incident state.",
      inputSchema: resolveIncidentInputSchema.shape,
    },
    async ({ id }) =>
      handleToolCall("resolve_incident", () => service.resolveIncident(id)),
  );

  return server;
}

export async function startOpsMcpServer(): Promise<void> {
  const server = createOpsMcpServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write("OpsPilot MCP server ready (stdio)\n");
  process.once("beforeExit", closeDefaultOpsStore);

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    void server
      .close()
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[opspilot] shutdown failed: ${detail}\n`);
        process.exitCode = 1;
      })
      .finally(() => closeDefaultOpsStore());
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && fileURLToPath(import.meta.url) === entryPoint;
}

if (isMainModule()) {
  void startOpsMcpServer().catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[opspilot] startup failed: ${detail}\n`);
    closeDefaultOpsStore();
    process.exitCode = 1;
  });
}
