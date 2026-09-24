import { renderToStaticMarkup } from "react-dom/server";
import { createTheme, ThemeProvider } from "@mui/material";
import { describe, test, expect, vi } from "vitest";
import { RootStore } from "../src/stores/RootStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { DebugPanelX } from "../src/components/debug/DebugPanel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("debug panel rendering", () => {
  test.each(["light", "dark"] as const)("renders controls, limits and retained state in %s theme", mode => {
    const root = new RootStore({ request: vi.fn(), onEvent: () => () => undefined });
    const context = { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" };
    root.debugStore.snapshot = { revision: 1, session: { id: "session", configuration: {
      id: "config", name: "Node", adapter: "javascript", context, target: "node", request: "attach", port: 9229
    }, state: "running", epoch: 1, capabilities: {}, breakpoints: [], output: [] },
    preferences: { configurations: [], breakpoints: [], watches: [] } };
    const project = { project: { id: "project" }, workspaces: { current: { id: "main", name: "Main", sourceId: "local", path: "/project" } } } as ProjectStore;
    const markup = renderToStaticMarkup(<ThemeProvider theme={createTheme({ palette: { mode } })}>
      <DebugPanelX store={root} projectStore={project} />
    </ThemeProvider>);
    expect(markup).toContain("debug.limits");
    expect(markup).toContain('aria-label="debug.disconnect"');
    expect(markup).toContain("debug.states.running");
    expect(markup).toContain("debug.breakpoints");
    expect(markup).toContain("debug.console");
  });
});
