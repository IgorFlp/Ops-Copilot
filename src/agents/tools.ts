import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createIncidentService,
  IncidentServiceStore,
} from "../services/incident-service.js";

const alertStatusSchema = z.enum(["firing", "resolved", "all"]).default("firing");
const severitySchema = z.enum(["critical", "high", "medium", "low"]);
const listAlertsInputSchema = z.object({ status: alertStatusSchema });
const openIncidentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  service: z.string().trim().min(1).max(120),
  severity: severitySchema,
});
const resolveIncidentInputSchema = z.object({
  id: z.number().int().positive(),
});

export function createOpsTools(store?: IncidentServiceStore) {
  const service = store
    ? createIncidentService(store)
    : createIncidentService();

  const listAlerts = tool(
    async ({ status }) => JSON.stringify(await service.listAlerts(status)),
    {
      name: "list_alerts",
      description:
        "List monitoring alerts by status. Use when asked what is firing or about service health. Status: firing, resolved, or all.",
      schema: listAlertsInputSchema,
    },
  );

  const openIncident = tool(
    async ({ title, service: serviceSlug, severity }) =>
      JSON.stringify(
        await service.openIncident({
          title,
          service: serviceSlug,
          severity,
        }),
      ),
    {
      name: "open_incidente",
      description:
        "Open an incident for an existing service with a title and severity.",
      schema: openIncidentInputSchema,
    },
  );

  const resolveIncident = tool(
    async ({ id }) => JSON.stringify(await service.resolveIncident(id)),
    {
      name: "resolve_incidente",
      description: "Resolve an existing open incident by its numeric identifier.",
      schema: resolveIncidentInputSchema,
    },
  );

  return [listAlerts, openIncident, resolveIncident] as const;
}

export const opsTools = createOpsTools();
export const [listAlerts, openIncident, resolveIncident] = opsTools;

export function invokeOpsTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_alerts":
      return listAlerts.invoke(listAlertsInputSchema.parse(args));
    case "open_incidente":
      return openIncident.invoke(openIncidentInputSchema.parse(args));
    case "resolve_incidente":
      return resolveIncident.invoke(resolveIncidentInputSchema.parse(args));
    default:
      throw new Error(`Unknown operational tool: ${name}`);
  }
}
