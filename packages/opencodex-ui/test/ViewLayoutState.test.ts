/**
 * Covers view layout state retained outside mounted React components.
 */
import { describe, expect, it } from "vitest";

import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

import { HomeStore } from "../src/stores/HomeStore";
import { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

describe("view layout state", () => {
  it("should retain the Home sidebar width outside the mounted view", () => {
    const homeStore = new HomeStore();

    homeStore.setSidebarWidth(420);

    expect(homeStore.sidebarWidth).toBe(420);
  });

  it("should retain each project panel layout outside the mounted view", () => {
    const projectStore = new ProjectStore(createProject(), {} as RootStore);

    projectStore.setWorkspaceSidebarWidth(410);
    projectStore.setSidePanelWidth(460);
    projectStore.setSidePanelCollapsed(true);

    expect(projectStore.workspaceSidebarWidth).toBe(410);
    expect(projectStore.sidePanelWidth).toBe(460);
    expect(projectStore.isSidePanelCollapsed).toBe(true);
  });
});

/**
 * Creates deterministic project metadata for layout state tests.
 *
 * @returns Project fixture.
 */
function createProject(): OpenCodexProject {
  return {
    id: "project-1",
    sourceId: "source-1",
    path: "/tmp/project",
    defaultName: "project",
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    lastSeenAt: "2026-07-14T00:00:00.000Z",
    editedAt: "2026-07-14T00:00:00.000Z"
  };
}
