import { z } from "zod";

export const listAlertsInputSchema = z.object({
  status: z
    .enum(["firing", "resolved", "all"])
    .default("firing")
    .describe(
      "Alert status to list: firing, resolved, or all. Defaults to firing. Read-only; does not change alert state.",
    ),
});

export const listIncidentsInputSchema = z.object({
  status: z
    .enum(["open", "resolved", "all"])
    .default("open")
    .describe(
      "Incident status to list: open, resolved, or all. Defaults to open. Read-only; does not change incident state.",
    ),
});

export const resolveIncidentInputSchema = z.object({
  id: z
    .number()
    .int()
    .positive()
    .describe("Positive numeric identifier of an existing open incident."),
});
