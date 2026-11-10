import { BrowserRouter } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ApiConfigProvider } from "./hooks/useApiConfig";
import { ThemeProvider } from "./hooks/useTheme";
import { BASE_PATH } from "./lib/config";
import { AppRoutes } from "./router";

export function App() {
  return (
    <ThemeProvider>
      <ApiConfigProvider>
        <BrowserRouter basename={BASE_PATH}>
          <AppShell>
            <AppRoutes />
          </AppShell>
        </BrowserRouter>
      </ApiConfigProvider>
    </ThemeProvider>
  );
}
