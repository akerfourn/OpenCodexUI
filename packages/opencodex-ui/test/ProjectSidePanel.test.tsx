/**
 * Covers the project side-panel navigation structure.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "../src/stores/RootStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock("../src/components/projects/ProjectCommandsPanel", () => ({
  ProjectCommandsPanelX: () => null
}));
vi.mock("../src/components/projects/ProjectComposePanel", () => ({
  ProjectComposePanelX: () => null
}));
vi.mock("../src/components/projects/ProjectContextPanel", () => ({
  ProjectContextPanelX: () => null
}));
vi.mock("../src/components/projects/ProjectGitPanel", () => ({
  ProjectGitPanelX: () => null
}));
vi.mock("../src/components/projects/ProjectRulesPanel", () => ({
  ProjectRulesPanelX: () => null
}));
vi.mock("../src/components/projects/ProjectTasksPanel", () => ({
  ProjectTasksPanelX: () => null
}));

import { ProjectSidePanel } from "../src/components/projects/ProjectSidePanel";

describe("ProjectSidePanel", () => {
  it("should keep the expanded project tool selector vertical with an active bubble", () => {
    const markup = renderToStaticMarkup(
      <ProjectSidePanel
        store={{} as RootStore}
        projectStore={{} as ProjectStore}
        isCollapsed={false}
        onCollapsedChange={vi.fn()}
      />
    );

    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('aria-label="projectTools.tabs"');
    expect(markup).toContain('aria-label="projectTools.closePanel"');
    expect(markup).toContain("MuiTab-root");
    expect(markup).toContain("Mui-selected");
  });

  it("should highlight the active tool bubble when collapsed", () => {
    const markup = renderToStaticMarkup(
      <ProjectSidePanel
        store={{} as RootStore}
        projectStore={{} as ProjectStore}
        isCollapsed={true}
        onCollapsedChange={vi.fn()}
      />
    );

    expect(markup).toContain("project-side-panel-tool-button is-active");
    expect(markup).toContain('aria-label="projectTools.git"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("should expose Compose only when a Compose file is detected", () => {
    const projectStore = {
      composeStore: {
        hasComposeFile: true,
        isAvailable: true,
        hasLoaded: true,
        isLoading: false
      },
      project: {
        path: "/workspace/project",
        sourceId: "source-1"
      }
    } as unknown as ProjectStore;

    const markup = renderToStaticMarkup(
      <ProjectSidePanel
        store={{} as RootStore}
        projectStore={projectStore}
        isCollapsed={true}
        onCollapsedChange={vi.fn()}
      />
    );

    expect(markup).toContain('aria-label="projectTools.compose"');
  });

  it("should hide Compose for an orphan project even with stale snapshot state", () => {
    const projectStore = {
      composeStore: {
        hasComposeFile: true,
        hasLoaded: true,
        isLoading: false,
        snapshot: { composeFile: "compose.yaml" }
      },
      project: {
        path: "/workspace/project",
        sourceId: null
      }
    } as unknown as ProjectStore;

    const markup = renderToStaticMarkup(
      <ProjectSidePanel
        store={{} as RootStore}
        projectStore={projectStore}
        isCollapsed={true}
        onCollapsedChange={vi.fn()}
      />
    );

    expect(markup).not.toContain('aria-label="projectTools.compose"');
  });
});
