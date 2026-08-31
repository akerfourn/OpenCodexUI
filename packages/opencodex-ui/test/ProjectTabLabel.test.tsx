import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ProjectStore } from "../src/stores/project/ProjectStore";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

import { ProjectTabLabel } from "../src/components/app/ProjectTabLabel";

describe("ProjectTabLabel", () => {
  it("should show a project activity marker when a tool needs attention", () => {
    const markup = renderToStaticMarkup(
      <ProjectTabLabel
        projectStore={createProjectStore(true)}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("project-tab-activity-indicator is-active");
    expect(markup).toContain('data-testid="project-tab-activity-marker"');
  });

  it("should keep the project icon unmarked when no tool needs attention", () => {
    const markup = renderToStaticMarkup(
      <ProjectTabLabel
        projectStore={createProjectStore(false)}
        onClose={vi.fn()}
      />
    );

    expect(markup).toContain("project-tab-activity-indicator");
    expect(markup).not.toContain("project-tab-activity-indicator is-active");
    expect(markup).not.toContain('data-testid="project-tab-activity-marker"');
  });
});

/** Creates the smallest project surface used by the tab label. */
function createProjectStore(hasSidePanelActivity: boolean): ProjectStore {
  return {
    project: { id: "project-1" },
    displayName: "Project",
    indicatorState: "idle",
    hasSidePanelActivity
  } as ProjectStore;
}
