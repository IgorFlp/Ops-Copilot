import { z } from "zod";

export const TRACE_EVENT_TYPES = [
  "thought",
  "action",
  "observation",
  "plan",
  "critique",
  "answer",
  "summarize",
  "route",
  "context",
  "fallback",
  "handoff",
] as const;

export type KnownTraceEventType = (typeof TRACE_EVENT_TYPES)[number];

/** Unknown types are preserved and rendered with a fallback. */
export type TraceEventType = KnownTraceEventType | (string & {});

export const TRACE_NODE_IDS = [
  "context",
  "route",
  "react",
  "plan-and-execute",
  "reflect:react",
  "summary",
  "team",
] as const;

export type TraceNodeId = (typeof TRACE_NODE_IDS)[number] | (string & {});

export const traceEventSchema = z
  .object({
    type: z.string(),
    content: z.string(),
    node: z.string().optional(),
    timestamp: z.string().optional(),
    tools: z.array(z.string()).optional(),
    args: z.record(z.string(), z.unknown()).optional(),
    approved: z.boolean().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    brief: z.string().optional(),
  })
  .passthrough();

export type TraceEvent = z.infer<typeof traceEventSchema>;

export function isKnownTraceEventType(
  type: string,
): type is KnownTraceEventType {
  return (TRACE_EVENT_TYPES as readonly string[]).includes(type);
}
