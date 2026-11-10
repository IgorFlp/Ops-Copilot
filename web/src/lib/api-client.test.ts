import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./api-client";
import { ApiError } from "./errors";
import { chatPending, chatSuccess, jsonResponse } from "../test/fixtures";

function clientWith(fetchImpl: ReturnType<typeof vi.fn>) {
  return createApiClient(
    () => "http://api.test",
    fetchImpl as unknown as typeof fetch,
  );
}

describe("createApiClient.chat", () => {
  it("posts to /chat and returns an answer on 200", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, chatSuccess, { "X-Request-Id": "req-0001" }),
      );

    const outcome = await clientWith(fetchImpl).chat({
      userId: "operator-1",
      message: "hi",
    });

    expect(outcome.kind).toBe("answer");
    if (outcome.kind === "answer") {
      expect(outcome.response.answer).toBe(chatSuccess.answer);
      expect(outcome.response.requestId).toBe("req-0001");
    }
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/chat");
    expect(init.method).toBe("POST");
  });

  it("returns pending approval on 202", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(202, chatPending));

    const outcome = await clientWith(fetchImpl).chat({
      userId: "operator-1",
      message: "open an incident",
    });

    expect(outcome.kind).toBe("pending");
    if (outcome.kind === "pending") {
      expect(outcome.pending.approval.approvalId).toBe("apv-1");
      expect(outcome.pending.approval.action.tool).toBe("open_incidente");
    }
  });

  it("maps 400 to VALIDATION with issues", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(400, {
        error: "Invalid request",
        issues: [{ path: ["message"], message: "Required" }],
      }),
    );

    await expect(
      clientWith(fetchImpl).chat({ userId: "operator-1", message: "" }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
  });

  it("maps 422, 503 and 504 to specific codes", async () => {
    const cases: [number, string][] = [
      [422, "UNSUPPORTED_STRATEGY"],
      [503, "MODEL_UNAVAILABLE"],
      [504, "TIMEOUT"],
    ];

    for (const [status, code] of cases) {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(status, { error: "nope" }));
      await expect(
        clientWith(fetchImpl).chat({ userId: "operator-1", message: "hi" }),
      ).rejects.toMatchObject({ code });
    }
  });

  it("maps network failures to NETWORK", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      clientWith(fetchImpl).chat({ userId: "operator-1", message: "hi" }),
    ).rejects.toMatchObject({ code: "NETWORK", status: 0 });
  });

  it("throws INTERNAL when a 200 body is malformed", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { unexpected: true }));

    await expect(
      clientWith(fetchImpl).chat({ userId: "operator-1", message: "hi" }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("createApiClient.decide", () => {
  it("posts a decision and returns the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        approvalId: "apv-1",
        status: "approved",
        requestId: "req-202",
        result: chatSuccess,
      }),
    );

    const result = await clientWith(fetchImpl).decide(
      "apv-1",
      "approve",
      "operator-1",
    );

    expect(result.status).toBe("approved");
    expect(result.result?.answer).toBe(chatSuccess.answer);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/approvals/apv-1/decision");
    expect(JSON.parse(String(init.body))).toEqual({
      decision: "approve",
      userId: "operator-1",
    });
  });

  it("maps 409 to CONFLICT", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { error: "no longer pending" }));

    await expect(
      clientWith(fetchImpl).decide("apv-1", "deny", "operator-1"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
