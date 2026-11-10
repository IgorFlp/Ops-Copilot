import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalCard } from "./ApprovalCard";
import type { PendingApprovalState } from "../../types/approval";

const base: PendingApprovalState = {
  approvalId: "apv-1",
  requestId: "req-202",
  action: {
    tool: "open_incidente",
    summary: "Open a P1 incident for checkout latency",
    args: { severity: "P1", service: "checkout" },
  },
  status: "pending",
};

describe("ApprovalCard", () => {
  it("renders the proposed action, tool and arguments", () => {
    render(<ApprovalCard pending={base} onDecide={vi.fn()} />);

    expect(
      screen.getByText("Open a P1 incident for checkout latency"),
    ).toBeInTheDocument();
    expect(screen.getByText("open_incidente")).toBeInTheDocument();
    expect(screen.getByText(/"severity": "P1"/)).toBeInTheDocument();
  });

  it("submits an approval", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(<ApprovalCard pending={base} onDecide={onDecide} />);

    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    expect(onDecide).toHaveBeenCalledWith("approve");
  });

  it("submits a denial", async () => {
    const onDecide = vi.fn();
    const user = userEvent.setup();
    render(<ApprovalCard pending={base} onDecide={onDecide} />);

    await user.click(screen.getByRole("button", { name: "Negar" }));

    expect(onDecide).toHaveBeenCalledWith("deny");
  });

  it("disables both buttons while submitting", () => {
    render(
      <ApprovalCard pending={{ ...base, status: "submitting" }} onDecide={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Aprovar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Negar" })).toBeDisabled();
  });

  it("shows the outcome once decided", () => {
    render(
      <ApprovalCard pending={{ ...base, status: "approved" }} onDecide={vi.fn()} />,
    );

    expect(screen.getByText("Aprovado")).toBeInTheDocument();
  });

  it("keeps the card actionable and shows the error when a decision fails", () => {
    render(
      <ApprovalCard
        pending={{ ...base, status: "failed", error: "Serviço indisponível" }}
        onDecide={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Aprovar" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Serviço indisponível");
  });
});
