import "highlight.js/styles/github-dark.min.css";
import "@open-codex-ui/opencodex-ui/src/styles.css";

import { App, RootStore } from "@open-codex-ui/opencodex-ui";
import { Profiler, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ElectronOpenCodexTransport } from "./electronTransport";

const store = new RootStore(new ElectronOpenCodexTransport());
const rootElement = document.getElementById("root");

void store.bootstrap();

if (rootElement !== null) {
  createRoot(rootElement).render(
    <StrictMode>
      <Profiler id="OpenCodexUI" onRender={handleRenderProfiler}>
        <App store={store} />
      </Profiler>
    </StrictMode>
  );
}

function handleRenderProfiler(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info("[OpenCodexUI profiler]", {
    id,
    phase,
    actualDuration: Number(actualDuration.toFixed(2)),
    baseDuration: Number(baseDuration.toFixed(2)),
    startTime: Number(startTime.toFixed(2)),
    commitTime: Number(commitTime.toFixed(2))
  });
}
