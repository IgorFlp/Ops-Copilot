import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "./ChatPage";
import { ApiConfigProvider } from "../hooks/useApiConfig";
import { ThemeProvider } from "../hooks/useTheme";
import { chatSuccess, jsonResponse } from "../test/fixtures";

let fetchMock: ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <ThemeProvider>
      <ApiConfigProvider initial="http://api.test">
        <MemoryRouter initialEntries={["/chat"]}>
          <ChatPage />
        </MemoryRouter>
      </ApiConfigProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChatPage", () => {
  it("shows an empty state before the first message", () => {
    renderPage();
    expect(screen.getByText("Comece a conversa")).toBeInTheDocument();
  });

  it("sends a message and renders the answer, metrics and request id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, chatSuccess, { "X-Request-Id": "req-0001" }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Mensagem"), "check alerts");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(await screen.findByText(chatSuccess.answer)).toBeInTheDocument();
    expect(screen.getByText("Chamadas")).toBeInTheDocument();
    expect(screen.getByText("850 ms")).toBeInTheDocument();
    expect(screen.getByText(/req-0001/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ver raciocínio" }),
    ).toBeInTheDocument();
  });

  it("blocks sending an empty message with an inline error", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      screen.getByText("Digite uma mensagem antes de enviar."),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a connectivity error with a retry action", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Mensagem"), "check alerts");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    expect(
      await screen.findByText(/Could not reach the API/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeInTheDocument();
  });
});
