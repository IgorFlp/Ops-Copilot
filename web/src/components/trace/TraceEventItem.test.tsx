import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TraceEventItem } from "./TraceEventItem";
import type { TraceEvent } from "../../types/trace";

describe("TraceEventItem", () => {
  it("renders a handoff with its label and structured details", () => {
    const event: TraceEvent = {
      type: "handoff",
      content: "supervisor → analista: Diagnostique os alertas.",
      node: "team",
      timestamp: "2026-11-10T12:00:00.900Z",
      from: "supervisor",
      to: "analista",
      brief: "Diagnostique os alertas.",
    };

    render(<TraceEventItem event={event} />);

    expect(screen.getByText("Handoff")).toBeInTheDocument();
    expect(screen.getByText("De")).toBeInTheDocument();
    expect(screen.getByText("supervisor")).toBeInTheDocument();
    expect(screen.getByText("Para")).toBeInTheDocument();
    expect(screen.getByText("analista")).toBeInTheDocument();
    expect(screen.getByText("Brief")).toBeInTheDocument();
    expect(screen.getByText("Diagnostique os alertas.")).toBeInTheDocument();
  });

  it("renders an unknown type with a fallback label", () => {
    const event: TraceEvent = {
      type: "custom_event",
      content: "raw payload",
      node: "react",
    };

    render(<TraceEventItem event={event} />);

    expect(screen.getByText("Evento: custom_event")).toBeInTheDocument();
    expect(screen.getByText("raw payload")).toBeInTheDocument();
  });
});
