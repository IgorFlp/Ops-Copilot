import { z } from "zod";
import { chatResponseSchema } from "./chat";

export const pendingApprovalSchema = z.object({
  status: z.literal("pending_approval"),
  requestId: z.string(),
  conversationId: z.string().optional(),
  approval: z.object({
    approvalId: z.string(),
    requestId: z.string(),
    action: z.object({
      tool: z.string(),
      summary: z.string().optional(),
      args: z.record(z.string(), z.unknown()).optional(),
    }),
    expiresAt: z.string().optional(),
  }),
});

export type PendingApproval = z.infer<typeof pendingApprovalSchema>;

export const approvalResultSchema = z.object({
  approvalId: z.string(),
  status: z.enum(["approved", "denied"]),
  requestId: z.string(),
  result: chatResponseSchema.optional(),
});

export type ApprovalResult = z.infer<typeof approvalResultSchema>;

export type ApprovalDecision = "approve" | "deny";

export type PendingApprovalStatus =
  | "pending"
  | "submitting"
  | "approved"
  | "denied"
  | "failed";

export interface PendingApprovalState {
  approvalId: string;
  requestId: string;
  conversationId?: string;
  action: {
    tool: string;
    summary?: string;
    args?: Record<string, unknown>;
  };
  expiresAt?: string;
  status: PendingApprovalStatus;
  result?: ApprovalResult;
  error?: string;
}
