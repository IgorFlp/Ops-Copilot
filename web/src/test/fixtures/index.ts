import type { ChatResponse } from "../../types/chat";
import type { PendingApproval } from "../../types/approval";

export const sampleTrace = [
  {
    type: "thought",
    content: "Check the alert backlog.",
    node: "react",
    timestamp: "2026-11-10T12:00:00.000Z",
  },
  {
    type: "action",
    content: "List alerts for checkout.",
    node: "react",
    timestamp: "2026-11-10T12:00:00.200Z",
    tools: ["list_alerts"],
    args: { service: "checkout" },
  },
  {
    type: "observation",
    content: "3 alerts found.",
    node: "react",
    timestamp: "2026-11-10T12:00:00.400Z",
  },
  {
    type: "critique",
    content: "The alert is relevant.",
    node: "reflect:react",
    timestamp: "2026-11-10T12:00:00.600Z",
    approved: true,
  },
  {
    type: "answer",
    content: "Checkout latency is elevated.",
    node: "react",
    timestamp: "2026-11-10T12:00:00.800Z",
  },
  {
    type: "custom_event",
    content: "raw payload",
    node: "react",
  },
];

export const chatSuccess: ChatResponse = {
  answer: "Checkout latency is elevated.",
  trace: sampleTrace,
  metrics: {
    calls: 2,
    latencyMs: 850,
    historyMessages: 0,
    promptTokens: 120,
    contextBreakdown: { currentMessage: 5 },
  },
  requestId: "req-0001",
  conversationId: "conv-0001",
};

export const chatSuccessWithoutTrace: ChatResponse = {
  ...chatSuccess,
  trace: [],
  requestId: "req-empty",
};

export const chatPending: PendingApproval = {
  status: "pending_approval",
  requestId: "req-202",
  conversationId: "conv-0001",
  approval: {
    approvalId: "apv-1",
    requestId: "req-202",
    action: {
      tool: "open_incidente",
      summary: "Open a P1 incident for checkout latency",
      args: { severity: "P1", service: "checkout" },
    },
    expiresAt: "2026-11-10T12:05:00.000Z",
  },
};

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function mockFetchOnce(
  fetchImpl: ReturnType<typeof vi.fn>,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  fetchImpl.mockResolvedValueOnce(jsonResponse(status, body, headers));
}
