import "highlight.js/styles/github-dark.min.css";
import "@open-codex-ui/opencodex-ui/src/styles.css";

import { AppX, RootStore, opencodexTheme } from "@open-codex-ui/opencodex-ui";
import { CssBaseline } from "@mui/material";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ElectronOpenCodexTransport } from "./electronTransport";

const store = new RootStore(new ElectronOpenCodexTransport());
const rootElement = document.getElementById("root");

void store.bootstrap();

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
