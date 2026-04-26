import "highlight.js/styles/github-dark.min.css";
import "@open-codex-ui/opencodex-ui/src/styles.css";

import { App, RootStore } from "@open-codex-ui/opencodex-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ElectronOpenCodexTransport } from "./electronTransport";

const store = new RootStore(new ElectronOpenCodexTransport());
const rootElement = document.getElementById("root");

void store.bootstrap();

if (rootElement !== null) {
  createRoot(rootElement).render(
    <StrictMode>
      <App store={store} />
    </StrictMode>
  );
}
