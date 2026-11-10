import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "./router";
import { ApiConfigProvider } from "./hooks/useApiConfig";
import { ThemeProvider } from "./hooks/useTheme";

function renderAt(path: string) {
  return render(
    <ThemeProvider>
      <ApiConfigProvider initial="http://api.test">
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ApiConfigProvider>
    </ThemeProvider>,
  );
}

describe("AppRoutes", () => {
  it("redirects the root path to the chat route", () => {
    renderAt("/");
    expect(screen.getByText("Comece a conversa")).toBeInTheDocument();
  });

  it("renders the chat route", () => {
    renderAt("/chat");
    expect(screen.getByText("Comece a conversa")).toBeInTheDocument();
  });

  it("renders a not-found page for unknown routes with a link back to chat", () => {
    renderAt("/nope");
    expect(
      screen.getByRole("heading", { name: "Página não encontrada" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir para o chat" }),
    ).toBeInTheDocument();
  });
});
