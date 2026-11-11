import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChat } from "./useChat";
import type { ApiClient } from "../lib/api-client";
import { ApiError } from "../lib/errors";
import { chatPending, chatSuccess } from "../test/fixtures";

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    chat: vi.fn().mockResolvedValue({ kind: "answer", response: chatSuccess }),
    decide: vi.fn(),
    ...overrides,
  } as ApiClient;
}

describe("useChat", () => {
  it("appends the user message and the assistant answer on success", async () => {
    const client = makeClient();
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1" }),
    );

    await act(async () => {
      await result.current.send("  hello  ");
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      role: "user",
      content: "hello",
      status: "sent",
    });
    expect(result.current.messages[1]).toMatchObject({
      role: "assistant",
      content: chatSuccess.answer,
      requestId: "req-0001",
    });
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("marks the message failed and exposes the error on failure", async () => {
    const client = makeClient({
      chat: vi
        .fn()
        .mockRejectedValue(
          new ApiError(504, "TIMEOUT", "The request timed out. Try again."),
        ),
    });
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1" }),
    );

    await act(async () => {
      await result.current.send("hello");
    });

    expect(result.current.messages[0].status).toBe("failed");
    expect(result.current.error?.code).toBe("TIMEOUT");
  });

  it("retries the last failed message without duplicating it", async () => {
    const chat = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK", "offline"))
      .mockResolvedValueOnce({ kind: "answer", response: chatSuccess });
    const client = makeClient({ chat });
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1" }),
    );

    await act(async () => {
      await result.current.send("hello");
    });
    await act(async () => {
      await result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(result.current.messages[0].status).toBe("sent");
    expect(result.current.error).toBeNull();
  });

  it("exposes a pending approval on 202 and clears it on approval", async () => {
    const client = makeClient({
      chat: vi.fn().mockResolvedValue({ kind: "pending", pending: chatPending }),
      decide: vi.fn().mockResolvedValue({
        approvalId: "apv-1",
        status: "approved",
        requestId: "req-202",
        result: chatSuccess,
      }),
    });
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1" }),
    );

    await act(async () => {
      await result.current.send("open incident");
    });
    expect(result.current.pending?.status).toBe("pending");

    await act(async () => {
      await result.current.decide("approve");
    });
    expect(result.current.pending?.status).toBe("approved");
    expect(result.current.messages).toHaveLength(2);
  });

  it("keeps the approval actionable when a decision fails", async () => {
    const client = makeClient({
      chat: vi.fn().mockResolvedValue({ kind: "pending", pending: chatPending }),
      decide: vi
        .fn()
        .mockRejectedValue(new ApiError(500, "INTERNAL", "boom")),
    });
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1" }),
    );

    await act(async () => {
      await result.current.send("open incident");
    });
    await act(async () => {
      await result.current.decide("deny");
    });

    expect(result.current.pending?.status).toBe("failed");
    expect(result.current.pending?.error).toBeTruthy();
  });

  it("forwards the selected strategy in the request", async () => {
    const chat = vi.fn().mockResolvedValue({ kind: "answer", response: chatSuccess });
    const client = makeClient({ chat });
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1", strategy: "team" }),
    );

    await act(async () => {
      await result.current.send("coordene o plantão");
    });

    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: "team" }),
    );
  });

  it("omits the strategy when auto is selected", async () => {
    const chat = vi.fn().mockResolvedValue({ kind: "answer", response: chatSuccess });
    const client = makeClient({ chat });
    const { result } = renderHook(() =>
      useChat({ client, userId: "operator-1", strategy: "auto" }),
    );

    await act(async () => {
      await result.current.send("oi");
    });

    expect(chat.mock.calls[0][0]).not.toHaveProperty("strategy");
  });
});
