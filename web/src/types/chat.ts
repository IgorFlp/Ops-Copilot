import { z } from "zod";
import { traceEventSchema, type TraceEvent } from "./trace";

export const STRATEGIES = ["react", "plan-and-execute", "reflect:react"] as const;

export type Strategy = (typeof STRATEGIES)[number];

export const chatMetricsSchema = z.object({
  calls: z.number().nonnegative(),
  latencyMs: z.number().nonnegative(),
  historyMessages: z.number().nonnegative().optional(),
  promptTokens: z.number().nonnegative().optional(),
  contextBreakdown: z.record(z.string(), z.number()).optional(),
});

export type ChatMetrics = z.infer<typeof chatMetricsSchema>;

export const chatResponseSchema = z.object({
  answer: z.string(),
  trace: z.array(traceEventSchema).default([]),
  metrics: chatMetricsSchema,
  requestId: z.string(),
  conversationId: z.string().optional(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

export interface ChatRequest {
  userId: string;
  message: string;
  strategy?: Strategy;
  reflect?: boolean;
  conversationId?: string;
}

export type MessageStatus = "sending" | "sent" | "failed";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status: MessageStatus;
  trace?: TraceEvent[];
  metrics?: ChatMetrics;
  requestId?: string;
}
