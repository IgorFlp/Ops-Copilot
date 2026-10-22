import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  createIncidentService,
  IncidentServiceStore,
} from "../services/incident-service.js";

const alertStatusSchema = z.enum(["firing", "resolved", "all"]).default("firing");
const severityValues = ["critical", "high", "medium", "low"] as const;
const severityEnum = z.enum(severityValues);
const severitySchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const normalized = value.toLowerCase();
    const sevMatch = /^sev[-\s]?([1-4])$/.exec(normalized);
    const severity = sevMatch
      ? severityValues[Number(sevMatch[1]) - 1]
      : normalized;
    const parsed = severityEnum.safeParse(severity);
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: `Severity must be one of ${severityValues.join(", ")} or SEV-1 through SEV-4`,
      });
      return z.NEVER;
    }
    return parsed.data;
  })
  .describe(
    "Severity: critical, high, medium, or low. Incident levels SEV-1 through SEV-4 map to critical, high, medium, and low respectively.",
  );
const listAlertsInputSchema = z.object({ status: alertStatusSchema });
const openIncidentInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  service: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "Existing service slug, service name, or unambiguous short service reference such as checkout, payments, or catalog.",
    ),
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
        "Open an incident for an existing service with a title and severity. Use critical, high, medium, or low; SEV-1 maps to critical, SEV-2 to high, SEV-3 to medium, and SEV-4 to low.",
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

export function normalizeToolArguments(
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (name !== "resolve_incidente") return args;
  const aliases = ["id", "incident_id", "incidentId", "incidentID"] as const;
  const provided = aliases
    .map((key) => args[key])
    .filter((value) => value !== undefined);
  if (provided.length === 0) return args;

  const canonicalId = provided[0];
  if (
    provided.some(
      (value) => String(value).trim() !== String(canonicalId).trim(),
    )
  ) {
    throw new Error("Conflicting incident identifiers were provided");
  }
  const id =
    typeof canonicalId === "string" && /^\d+$/.test(canonicalId.trim())
      ? Number(canonicalId)
      : canonicalId;
  return { ...args, id };
}

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
      return resolveIncident.invoke(
        resolveIncidentInputSchema.parse(normalizeToolArguments(name, args)),
      );
    default:
      throw new Error(`Unknown operational tool: ${name}`);
  }
}
