/**
 * Boots the React renderer inside Electron and refreshes the active thread on focus.
 */
import "highlight.js/styles/github-dark.min.css";
import "@open-codex-ui/opencodex-ui/src/styles.css";

import {
  AppX,
  OpenCodexThemeProviderX,
  RootStore,
  UsageHistoryWindowX,
  initializeOpenCodexI18n,
  setRendererPerformanceRecorder
} from "@open-codex-ui/opencodex-ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ElectronOpenCodexTransport } from "./electronTransport";
import { RendererPerformanceMonitor } from "./rendererPerformanceMonitor";

initializeOpenCodexI18n();

const transport = new ElectronOpenCodexTransport();
const rootElement = document.getElementById("root");

if (rootElement !== null && readRendererView() === "usage-history") {
  createRoot(rootElement).render(
    <StrictMode>
      <UsageHistoryWindowX
        transport={transport}
        initialSourceId={new URLSearchParams(window.location.search).get("sourceId") ?? ""}
      />
    </StrictMode>
  );
} else if (rootElement !== null) {
  const store = new RootStore(transport);
  const performanceMonitor = new RendererPerformanceMonitor(() => store.settings);
  transport.setPerformanceMonitor(performanceMonitor);
  setRendererPerformanceRecorder(performanceMonitor);
  store.appStore.setForceOnboarding(import.meta.env.DEV);

  void store.bootstrap();
  registerMainWindowFocusRefresh(store);
  createRoot(rootElement).render(
    <StrictMode>
      <OpenCodexThemeProviderX store={store}>
        <AppX store={store} />
      </OpenCodexThemeProviderX>
    </StrictMode>
  );
}

/**
 * Reads the renderer mode from the native window query string.
 *
 * @returns Dedicated renderer view, or the default application view.
 */
function readRendererView(): "main" | "usage-history" {
  return new URLSearchParams(window.location.search).get("view") === "usage-history"
    ? "usage-history"
    : "main";
}

/**
 * Keeps the main window's cached project and thread data fresh after focus.
 *
 * @param store Main application store.
 * @returns Nothing.
 */
function registerMainWindowFocusRefresh(store: RootStore): void {
  let lastFocusRefreshAt = 0;

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
}
