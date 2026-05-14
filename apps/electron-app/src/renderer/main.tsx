/**
 * Boots the React renderer inside Electron and refreshes the active thread on focus.
 */
import "highlight.js/styles/github-dark.min.css";
import "@open-codex-ui/opencodex-ui/src/styles.css";

import {
  AppX,
  OpenCodexThemeProviderX,
  RootStore,
  initializeOpenCodexI18n
} from "@open-codex-ui/opencodex-ui";
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
  const activeChatStore = store.activeChatStore;
  const activeProjectStore = store.activeProjectStore;

  if (activeChatStore?.canRefresh === true) {
    activeChatStore.refresh();
  }

  if (activeProjectStore !== null && !activeProjectStore.isLoadingThreads) {
    activeProjectStore.refreshThreads();
  }

  if (activeProjectStore === null) {
    store.projectsStore.refreshProjects();
  }
});

if (rootElement !== null) {
  createRoot(rootElement).render(
    <StrictMode>
      <OpenCodexThemeProviderX store={store}>
        <AppX store={store} />
      </OpenCodexThemeProviderX>
    </StrictMode>
  );
}
