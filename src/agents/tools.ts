import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { DomainError } from "../errors/domain-error.js";
import { errorDetail, logEvent } from "../lib/log.js";
import { getDefaultMemoryService } from "../memory/memory-store.js";
import {
  createIncidentService,
} from "../services/incident-service.js";
import type {
  IncidentServiceStore,
} from "../services/incident-service.js";
import type { MemoryService } from "../services/memory-service.js";
import { ReflectionAction } from "./types.js";
import { getDefaultOpsStore } from "../store/default-ops-store.js";
import { isMutationAuthorized } from "./mutation-policy.js";
import { fetchProviderStatus } from "./provider-status.js";
import {
  listAlertsInputSchema,
  listIncidentsInputSchema,
  resolveIncidentInputSchema,
} from "./tool-schemas.js";
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
const openIncidentInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Non-empty incident title, up to 200 characters."),
  service: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "Existing service slug, service name, or unambiguous short service reference. Use only a service that is affected by an operator-requested incident.",
    ),
  severity: severitySchema,
  summary: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .optional()
    .describe(
      "Optional incident summary of up to 4000 characters; omit or pass null when no summary is available.",
    ),
});
const runbookInputSchema = z.object({
  service: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "Non-empty service slug, service name, or unambiguous service reference whose runbook should be read.",
    ),
});
const providerStatusInputSchema = z.object({
  provider: z
    .enum(["github", "cloudflare"])
    .default("github")
    .describe(
      "External provider whose public status to check: github or cloudflare. Defaults to github. Use when an external dependency may be unavailable and you need to distinguish a provider incident from an internal issue. Read-only; does not change incident state.",
    ),
});
const forgetPreferenceInputSchema = z.object({
  preference: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("The specific saved preference the current user wants forgotten."),
}).strict();

type ListAlertsArgs = z.infer<typeof listAlertsInputSchema>;
type OpenIncidentArgs = z.infer<typeof openIncidentInputSchema>;
type ResolveIncidentArgs = z.infer<typeof resolveIncidentInputSchema>;
type ListIncidentsArgs = z.infer<typeof listIncidentsInputSchema>;
type RunbookArgs = z.infer<typeof runbookInputSchema>;
type ProviderStatusArgs = z.infer<typeof providerStatusInputSchema>;
type ForgetPreferenceArgs = z.infer<typeof forgetPreferenceInputSchema>;

export interface MemoryToolContext {
  userId: string;
  memoryService: Pick<MemoryService, "forgetPreference">;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableValue).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function summarizeToolArgs(args: unknown): Record<string, unknown> {
  if (typeof args !== "object" || args === null) return {};
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      summary[key] = value.length > 80 ? `${value.slice(0, 80)}...` : value;
    } else if (
      value === undefined ||
      value === null ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      summary[key] = value;
    } else {
      summary[key] = Array.isArray(value)
        ? `array(${value.length})`
        : typeof value;
    }
  }
  return summary;
}

function loggedTool<TArgs, TResult>(
  name: string,
  userId: string | undefined,
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args) => {
    const started = Date.now();
    logEvent("tool.start", {
      tool: name,
      userId,
      args: summarizeToolArgs(args),
    });
    try {
      const result = await handler(args);
      logEvent("tool.success", {
        tool: name,
        userId,
        durationMs: Date.now() - started,
        resultChars: typeof result === "string" ? result.length : undefined,
      });
      return result;
    } catch (error) {
      logEvent("tool.failure", {
        tool: name,
        userId,
        durationMs: Date.now() - started,
        error: errorDetail(error),
      });
      throw error;
    }
  };
}

function canonicalActionArgs(
  name: "open_incidente" | "resolve_incidente",
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (name === "resolve_incidente") {
    const normalized = normalizeToolArguments(name, args);
    const id = normalized.id;
    if (typeof id === "string" && /^\d+$/.test(id.trim())) {
      return { id: Number(id.trim()) };
    }
    return id === undefined ? normalized : { id };
  }

  const severity =
    typeof args.severity === "string"
      ? args.severity.trim().toLowerCase().replace(/^sev[-\s]?([1-4])$/, (_match, level: string) =>
          ["critical", "high", "medium", "low"][Number(level) - 1],
        )
        : args.severity;
  const summary =
    typeof args.summary === "string" ? args.summary.trim() : args.summary;
  return {
    ...(typeof args.title === "string" ? { title: args.title.trim() } : {}),
    ...(typeof args.service === "string"
        ? { service: args.service.trim() }
        : {}),
    ...(severity === undefined ? {} : { severity }),
    ...(summary === undefined ? {} : { summary }),
  };
}

export function priorMutationObservation(
  completedActions: ReflectionAction[],
  name: "open_incidente" | "resolve_incidente",
  args: Record<string, unknown>,
): string | undefined {
  const normalizedArgs = canonicalActionArgs(name, args);
  return completedActions.find(
    (action) =>
      action.tool === name &&
      stableValue(canonicalActionArgs(name, action.args)) ===
        stableValue(normalizedArgs),
  )?.observation;
}

export function createOpsTools(
  store?: IncidentServiceStore,
  completedActions: ReflectionAction[] = [],
  doFetch: typeof fetch = fetch,
  memoryContext?: MemoryToolContext,
) {
  const service = () =>
    createIncidentService(store ?? getDefaultOpsStore());
  const toolUserId = memoryContext?.userId;

  const listAlerts = tool(
    loggedTool(
      "list_alerts",
      toolUserId,
      async ({ status }: ListAlertsArgs) =>
        JSON.stringify(await service().listAlerts(status)),
    ),
    {
      name: "list_alerts",
      description:
        "Read monitoring alerts when asked what is firing, resolved, or about service health. Input status is firing, resolved, or all and defaults to firing. This is read-only and does not change alert state.",
      schema: listAlertsInputSchema,
    },
  );

  const openIncident = tool(
    loggedTool(
      "open_incidente",
      toolUserId,
      async ({
        title,
        service: serviceSlug,
        severity,
        summary,
      }: OpenIncidentArgs) => {
        const args = { title, service: serviceSlug, severity, summary };
        const previous = priorMutationObservation(
          completedActions,
          "open_incidente",
          args,
        );
        if (previous !== undefined) return previous;
        return JSON.stringify(
          await service().openIncident({
            title,
            service: serviceSlug,
            severity,
            summary,
          }),
        );
      },
    ),
    {
      name: "open_incidente",
      description:
        "Create and persist an incident only when the operator explicitly asks to open or track an incident for an affected service. Do not open one for requests to inspect alerts, summarize status, or recommend actions. Inputs: non-empty title (up to 200 characters), existing service reference, severity critical/high/medium/low (SEV-1 through SEV-4 aliases are accepted), and optional nullable summary (up to 4000 characters). This changes operational state.",
      schema: openIncidentInputSchema,
    },
  );

  const resolveIncident = tool(
    loggedTool(
      "resolve_incidente",
      toolUserId,
      async ({ id }: ResolveIncidentArgs) => {
        const args = { id };
        const previous = priorMutationObservation(
          completedActions,
          "resolve_incidente",
          args,
        );
        if (previous !== undefined) return previous;
        return JSON.stringify(await service().resolveIncident(id));
      },
    ),
    {
      name: "resolve_incidente",
      description:
        "Resolve an existing open incident only when the operator explicitly requests resolution. Input id is the positive numeric incident identifier. This changes incident state and records the resolution time; an unknown or already-resolved incident fails explicitly.",
      schema: resolveIncidentInputSchema,
    },
  );

  const listIncidents = tool(
    loggedTool(
      "List_incidentes",
      toolUserId,
      async ({ status }: ListIncidentsArgs) =>
        JSON.stringify(await service().listIncidents(status)),
    ),
    {
      name: "List_incidentes",
      description:
        "Read incidents when asked to review tracked work. Input status is open, resolved, or all and defaults to open. This is read-only and does not change incident state.",
      schema: listIncidentsInputSchema,
    },
  );

  const consultRunbook = tool(
    loggedTool(
      "consultar_runbook",
      toolUserId,
      async ({ service: serviceReference }: RunbookArgs) =>
        JSON.stringify(await service().getRunbook(serviceReference)),
    ),
    {
      name: "consultar_runbook",
      description:
        "Read service-specific operational guidance when asked how to investigate or respond for a service. Input service is a non-empty service slug, name, or unambiguous reference. This is read-only and does not change operational state; a missing runbook is reported explicitly.",
      schema: runbookInputSchema,
    },
  );

  const checkProviderStatus = tool(
    loggedTool(
      "check_provider_status",
      toolUserId,
      async ({ provider }: ProviderStatusArgs) =>
        fetchProviderStatus(provider, doFetch),
    ),
    {
      name: "check_provider_status",
      description:
        "Check GitHub or Cloudflare's public status during a suspected external dependency issue, such as when determining whether the problem is internal or on the provider's side. Input provider is github or cloudflare and defaults to github. This is read-only and returns a compact status observation or a readable limitation.",
      schema: providerStatusInputSchema,
    },
  );

  const operationalTools = [
    listAlerts,
    openIncident,
    resolveIncident,
    listIncidents,
    consultRunbook,
    checkProviderStatus,
  ] as const;
  if (!memoryContext) return operationalTools;
  if (!memoryContext.userId.trim()) {
    throw new DomainError("userId must not be empty", "VALIDATION");
  }
  const forgetPreference = tool(
    loggedTool(
      "forget_preference",
      toolUserId,
      async ({ preference }: ForgetPreferenceArgs) =>
        JSON.stringify(
          await memoryContext.memoryService.forgetPreference(
            memoryContext.userId,
            preference,
          ),
        ),
    ),
    {
      name: "forget_preference",
      description:
        "Forget one saved preference belonging to the current user. Input preference is a concise description of the specific preference. This operation is user-scoped and removes a memory only when exactly one relevant match exists; not_found and ambiguous results do not change memory.",
      schema: forgetPreferenceInputSchema,
    },
  );
  return [...operationalTools, forgetPreference] as const;
}

export function createOpsToolsForRequest(
  input: string,
  store?: IncidentServiceStore,
  completedActions: ReflectionAction[] = [],
  doFetch: typeof fetch = fetch,
  userId?: string,
  memoryService?: Pick<MemoryService, "forgetPreference">,
) {
  const memoryContext =
    userId === undefined
      ? undefined
      : {
          userId,
          memoryService: memoryService ?? getDefaultMemoryService(),
        };
  return createOpsTools(store, completedActions, doFetch, memoryContext).filter(({ name }) => {
    if (name === "open_incidente") {
      return isMutationAuthorized(input, "open_incidente");
    }
    if (name === "resolve_incidente") {
      return isMutationAuthorized(input, "resolve_incidente");
    }
    return true;
  });
}

export const opsTools = createOpsTools();
export const [
  listAlerts,
  openIncident,
  resolveIncident,
  listIncidents,
  consultRunbook,
  checkProviderStatus,
] = opsTools;

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

export async function invokeOpsTool(
  name: string,
  args: Record<string, unknown>,
  store?: IncidentServiceStore,
  doFetch: typeof fetch = fetch,
  userId?: string,
  memoryService?: Pick<MemoryService, "forgetPreference">,
): Promise<unknown> {
  const [alerts, open, resolve, incidents, runbook, providerStatus] =
    createOpsTools(store, [], doFetch);
  switch (name) {
    case "list_alerts":
      return alerts.invoke(listAlertsInputSchema.parse(args));
    case "open_incidente":
      return open.invoke(openIncidentInputSchema.parse(args));
    case "resolve_incidente":
      return resolve.invoke(
        resolveIncidentInputSchema.parse(normalizeToolArguments(name, args)),
      );
    case "List_incidentes":
      return incidents.invoke(listIncidentsInputSchema.parse(args));
    case "consultar_runbook":
      return runbook.invoke(runbookInputSchema.parse(args));
    case "check_provider_status":
      return providerStatus.invoke(providerStatusInputSchema.parse(args));
    case "forget_preference": {
      if (userId === undefined) {
        throw new DomainError(
          "forget_preference requires a request-scoped user",
          "VALIDATION",
        );
      }
      const { preference } = forgetPreferenceInputSchema.parse(args);
      return (memoryService ?? getDefaultMemoryService()).forgetPreference(
        userId,
        preference,
      );
    }
    default:
      throw new Error(`Unknown operational tool: ${name}`);
  }
}
