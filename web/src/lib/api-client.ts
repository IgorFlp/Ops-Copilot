import { normalizeBaseUrl } from "./config";
import {
  ApiError,
  codeForStatus,
  messageForCode,
  type ValidationIssue,
} from "./errors";
import {
  chatResponseSchema,
  type ChatRequest,
  type ChatResponse,
} from "../types/chat";
import {
  approvalResultSchema,
  pendingApprovalSchema,
  type ApprovalDecision,
  type ApprovalResult,
  type PendingApproval,
} from "../types/approval";

export type ChatOutcome =
  | { kind: "answer"; response: ChatResponse }
  | { kind: "pending"; pending: PendingApproval };

export interface ApiClient {
  chat(request: ChatRequest): Promise<ChatOutcome>;
  decide(
    approvalId: string,
    decision: ApprovalDecision,
    userId: string,
  ): Promise<ApprovalResult>;
}

interface HttpResult {
  status: number;
  body: unknown;
  requestId?: string;
}

const UNEXPECTED_RESPONSE = "The API returned an unexpected response.";

export function createApiClient(
  getBaseUrl: () => string,
  fetchImpl: typeof fetch = fetch,
): ApiClient {
  async function send(path: string, init: RequestInit): Promise<HttpResult> {
    const baseUrl = normalizeBaseUrl(getBaseUrl());
    if (baseUrl.length === 0) {
      throw new ApiError(0, "NETWORK", messageForCode("NETWORK", ""));
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiError(0, "NETWORK", messageForCode("NETWORK", ""));
    }

    let body: unknown = null;
    const text = await response.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }

    const requestId = response.headers.get("X-Request-Id") ?? undefined;

    if (!response.ok) {
      const record =
        body !== null && typeof body === "object"
          ? (body as Record<string, unknown>)
          : {};
      const code = codeForStatus(response.status);
      const fallback =
        typeof record.error === "string" ? record.error : "Request failed";
      const issues = Array.isArray(record.issues)
        ? (record.issues as ValidationIssue[])
        : [];
      throw new ApiError(response.status, code, messageForCode(code, fallback), issues);
    }

    return { status: response.status, body, requestId };
  }

  return {
    async chat(request: ChatRequest): Promise<ChatOutcome> {
      const result = await send("/chat", {
        method: "POST",
        body: JSON.stringify(request),
      });

      if (result.status === 202) {
        const parsed = pendingApprovalSchema.safeParse(result.body);
        if (!parsed.success) {
          throw new ApiError(202, "INTERNAL", UNEXPECTED_RESPONSE);
        }
        return { kind: "pending", pending: parsed.data };
      }

      const parsed = chatResponseSchema.safeParse(result.body);
      if (!parsed.success) {
        throw new ApiError(result.status, "INTERNAL", UNEXPECTED_RESPONSE);
      }
      return { kind: "answer", response: parsed.data };
    },

    async decide(
      approvalId: string,
      decision: ApprovalDecision,
      userId: string,
    ): Promise<ApprovalResult> {
      const result = await send(
        `/approvals/${encodeURIComponent(approvalId)}/decision`,
        {
          method: "POST",
          body: JSON.stringify({ decision, userId }),
        },
      );

      const parsed = approvalResultSchema.safeParse(result.body);
      if (!parsed.success) {
        throw new ApiError(result.status, "INTERNAL", UNEXPECTED_RESPONSE);
      }
      return parsed.data;
    },
  };
}
