import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsPanel } from "./SettingsPanel";

describe("SettingsPanel", () => {
  it("saves a valid URL and closes", async () => {
    const onSave = vi.fn().mockReturnValue({ ok: true });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsPanel
        open
        baseUrl="http://api.test"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    const input = screen.getByLabelText("URL da API");
    await user.clear(input);
    await user.type(input, "http://new.test");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSave).toHaveBeenCalledWith("http://new.test");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an inline error and keeps the panel open when invalid", async () => {
    const onSave = vi
      .fn()
      .mockReturnValue({ ok: false, error: "Enter a valid http(s) URL." });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsPanel
        open
        baseUrl="http://api.test"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid http(s) URL.",
    );
  });

  it("does not render when closed", () => {
    const { container } = render(
      <SettingsPanel
        open={false}
        baseUrl="http://api.test"
        onClose={vi.fn()}
        onSave={vi.fn().mockReturnValue({ ok: true })}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
