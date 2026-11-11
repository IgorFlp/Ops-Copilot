import { useCallback, useRef, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { ApiError } from "../lib/errors";
import type { ChatMessage, Strategy } from "../types/chat";
import type {
  ApprovalDecision,
  PendingApprovalState,
} from "../types/approval";

export interface UseChatOptions {
  client: ApiClient;
  userId: string;
  strategy?: Strategy | "auto";
}

export interface UseChatResult {
  messages: ChatMessage[];
  sending: boolean;
  error: ApiError | null;
  pending: PendingApprovalState | null;
  send(message: string): Promise<void>;
  retry(): Promise<void>;
  decide(decision: ApprovalDecision): Promise<void>;
  clearError(): void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, "INTERNAL", "Something went wrong. Try again.");
}

export function useChat({
  client,
  userId,
  strategy,
}: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState<PendingApprovalState | null>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);
  const lastFailedRef = useRef<{ id: string; content: string } | null>(null);

  const attempt = useCallback(
    async (text: string, userMessageId: string): Promise<void> => {
      setError(null);
      setSending(true);
      try {
        const outcome = await client.chat({
          userId,
          message: text,
          conversationId: conversationIdRef.current,
          ...(strategy && strategy !== "auto" ? { strategy } : {}),
        });

        lastFailedRef.current = null;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === userMessageId
              ? { ...message, status: "sent" }
              : message,
          ),
        );

        if (outcome.kind === "pending") {
          conversationIdRef.current =
            outcome.pending.conversationId ?? conversationIdRef.current;
          setPending({
            approvalId: outcome.pending.approval.approvalId,
            requestId: outcome.pending.approval.requestId,
            conversationId: outcome.pending.conversationId,
            action: {
              tool: outcome.pending.approval.action.tool,
              summary: outcome.pending.approval.action.summary,
              args: outcome.pending.approval.action.args,
            },
            expiresAt: outcome.pending.approval.expiresAt,
            status: "pending",
          });
          return;
        }

        const response = outcome.response;
        conversationIdRef.current =
          response.conversationId ?? conversationIdRef.current;
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: "assistant",
            content: response.answer,
            createdAt: new Date().toISOString(),
            status: "sent",
            trace: response.trace,
            metrics: response.metrics,
            requestId: response.requestId,
          },
        ]);
      } catch (caught) {
        lastFailedRef.current = { id: userMessageId, content: text };
        setMessages((prev) =>
          prev.map((message) =>
            message.id === userMessageId
              ? { ...message, status: "failed" }
              : message,
          ),
        );
        setError(toApiError(caught));
      } finally {
        setSending(false);
      }
    },
    [client, userId, strategy],
  );

  const send = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;

      const userMessage: ChatMessage = {
        id: createId(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        status: "sending",
      };
      setMessages((prev) => [...prev, userMessage]);
      await attempt(trimmed, userMessage.id);
    },
    [attempt],
  );

  const retry = useCallback(async (): Promise<void> => {
    const failed = lastFailedRef.current;
    if (!failed) return;
    await attempt(failed.content, failed.id);
  }, [attempt]);

  const decide = useCallback(
    async (decision: ApprovalDecision): Promise<void> => {
      if (!pending || pending.status === "submitting") return;
      const current = pending;
      setPending({ ...current, status: "submitting", error: undefined });
      try {
        const result = await client.decide(
          current.approvalId,
          decision,
          userId,
        );
        setPending({ ...current, status: result.status, result });
        if (result.result) {
          const response = result.result;
          conversationIdRef.current =
            response.conversationId ?? conversationIdRef.current;
          setMessages((prev) => [
            ...prev,
            {
              id: createId(),
              role: "assistant",
              content: response.answer,
              createdAt: new Date().toISOString(),
              status: "sent",
              trace: response.trace,
              metrics: response.metrics,
              requestId: response.requestId,
            },
          ]);
        }
      } catch (caught) {
        setPending({
          ...current,
          status: "failed",
          error: toApiError(caught).message,
        });
      }
    },
    [pending, client, userId],
  );

  const clearError = useCallback(() => setError(null), []);

  return { messages, sending, error, pending, send, retry, decide, clearError };
}
