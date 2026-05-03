import "highlight.js/styles/github-dark.min.css";
import "@open-codex-ui/opencodex-ui/src/styles.css";

import { AppX, RootStore, initializeOpenCodexI18n, opencodexTheme } from "@open-codex-ui/opencodex-ui";
import { CssBaseline } from "@mui/material";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ElectronOpenCodexTransport } from "./electronTransport";

initializeOpenCodexI18n();

const store = new RootStore(new ElectronOpenCodexTransport());
const rootElement = document.getElementById("root");
let lastFocusRefreshAt = 0;

void store.bootstrap();
window.addEventListener("focus", () => {
  const now = Date.now();

  if (now - lastFocusRefreshAt < 5_000) {
    return;
  }

  lastFocusRefreshAt = now;
  if (store.canRefreshCurrentThread()) {
    store.refreshCurrentThread();
  }
});

if (rootElement !== null) {
  createRoot(rootElement).render(
    <StrictMode>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={opencodexTheme}>
          <CssBaseline />
          <AppX store={store} />
        </ThemeProvider>
      </StyledEngineProvider>
    </StrictMode>
  );
}
