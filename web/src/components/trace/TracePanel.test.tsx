import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TracePanel } from "./TracePanel";
import { sampleTrace } from "../../test/fixtures";

describe("TracePanel", () => {
  it("renders every event in order with structured details", () => {
    render(<TracePanel trace={sampleTrace} open onClose={() => {}} />);

    expect(screen.getByText("Pensamento")).toBeInTheDocument();
    expect(screen.getByText("Ação")).toBeInTheDocument();
    expect(screen.getByText("Observação")).toBeInTheDocument();
    expect(screen.getByText("Crítica")).toBeInTheDocument();
    expect(screen.getByText("Resposta")).toBeInTheDocument();

    expect(screen.getByText("list_alerts")).toBeInTheDocument();
    expect(screen.getByText('{"service":"checkout"}')).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
  });

  it("renders unknown event types with their raw content", () => {
    render(<TracePanel trace={sampleTrace} open onClose={() => {}} />);

    expect(screen.getByText("Evento: custom_event")).toBeInTheDocument();
    expect(screen.getByText("raw payload")).toBeInTheDocument();
  });

  it("shows an explicit empty state when there is no trace", () => {
    render(<TracePanel trace={[]} open onClose={() => {}} />);
    expect(screen.getByText("Sem raciocínio registrado")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <TracePanel trace={sampleTrace} open={false} onClose={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<TracePanel trace={sampleTrace} open onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });
});
