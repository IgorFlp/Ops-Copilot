import { useState, type ReactNode } from "react";
import { useApiConfig } from "../../hooks/useApiConfig";
import { useTheme } from "../../hooks/useTheme";
import { Button } from "../ui/Button";
import { GearIcon, MoonIcon, SunIcon } from "../ui/icons";
import { SettingsPanel } from "../settings/SettingsPanel";

export function AppShell({ children }: { children: ReactNode }) {
  const { baseUrl, saveBaseUrl } = useApiConfig();
  const { resolved, setMode } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nextMode = resolved === "dark" ? "light" : "dark";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <span className="app-header__title">OpsCopilot — War Room</span>
        <div className="app-header__actions">
          <Button
            variant="icon"
            aria-label={
              resolved === "dark"
                ? "Mudar para tema claro"
                : "Mudar para tema escuro"
            }
            onClick={() => setMode(nextMode)}
          >
            {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
          <Button
            variant="icon"
            aria-label="Configurações da API"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
          </Button>
        </div>
      </header>
      <main id="main-content" className="app-main">
        {children}
      </main>
      <SettingsPanel
        open={settingsOpen}
        baseUrl={baseUrl}
        onClose={() => setSettingsOpen(false)}
        onSave={saveBaseUrl}
      />
    </div>
  );
}
