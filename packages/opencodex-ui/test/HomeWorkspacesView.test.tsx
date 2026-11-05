// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";
import { HomeWorkspacesViewX } from "../src/components/home/HomeWorkspacesView";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "fr" } }) }));
let root: Root;
let container: HTMLDivElement;

/** Locates real user actions without MUI-generated class names. */
function action(label: string, scope: ParentNode = document): HTMLButtonElement {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")]
    .find(item => item.textContent === label || item.getAttribute("aria-label") === label);
  if (button === undefined) throw new Error(`Missing action ${label}`);
  return button;
}

/** Real Home/project stores with synthetic catalogues; no source process or filesystem is accessed. */
async function fixture() {
  const projects: OpenCodexProject[] = ["online", "offline"].map(id => ({ id, sourceId: id, path: `/${id}`,
    defaultName: id, displayName: null, preferences: {}, isHidden: false,
    createdAt: "", updatedAt: "", editedAt: "", lastSeenAt: "" }));
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "projects.list") return projects;
    if (input.type === "threads.list") return [];
    if (input.type === "projectWorkspaces.list") return [{ id: `${input.projectId}-workspace`, projectId: input.projectId,
      sourceId: input.projectId, path: `/${input.projectId}/feature`, name: `Feature ${input.projectId}`,
      isPrimary: false, managed: true, removedAt: null, workStatus: "completed", completedAt: "2026-01-01T00:00:00Z" }];
    if (input.type === "projectWorkspaces.activity") return [{ workspaceId: `${input.projectId}-workspace`, sourceId: input.projectId,
      workspacePath: `/${input.projectId}/feature`, conversationCount: 1, activeConversationCount: 0,
      pendingOperationCount: 0, lastActivityAt: "2026-01-01T00:00:00Z" }];
    if (input.type === "projectWorkspaces.creations.list" || input.type === "projectWorkspaces.removals.list"
      || input.type === "projectWorkspaces.moves.list") return [];
    if (input.type === "projectWorkspaces.changes.read") return { ...input.input, state: "checked", hasChanges: false,
      checkedAt: "2026-11-05T11:00:00Z", lastChangedAt: null };
    if (input.type === "projectWorkspaces.lock.read") return { workspaceId: input.workspaceId, sourceId: input.sourceId,
      workspacePath: `/${input.projectId}/feature`, supported: true, lockedReason: null };
    if (input.type === "projectWorkspaces.diskUsage.read") return { ...input.input, logicalBytes: 1024, allocatedBytes: null,
      fileCount: 1, skippedLinks: 0, unreadableEntries: 0, complete: true, limitReached: false, measuredAt: "2026-11-05T11:00:00Z" };
    throw new Error(`Unexpected request ${input.type}`);
  });
  const app = new RootStore({ request, onEvent: () => () => undefined });
  app.projectsStore.projects = projects;
  vi.spyOn(app.sourcesStore, "isSourceReady").mockImplementation(id => id === "online");
  await act(async () => root.render(<HomeWorkspacesViewX store={app} />));
  return { app, request };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-05T12:00:00Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Home workspace inventory", () => {
  it("should show unopened projects, source availability and unknown sizes without scanning on entry", async () => {
    const { app, request } = await fixture();
    expect(container.querySelector('section[aria-label="online"]')?.textContent).toContain("Feature online");
    expect(container.querySelector('section[aria-label="offline"]')?.textContent).toContain("workspaceHome.offline");
    expect(container.textContent).toContain("workspaceHome.sizeUnknown");
    expect(app.projectsStore.projectStoresById.size).toBe(0);
    expect(request.mock.calls.some(([input]) => input.type.endsWith(".read"))).toBe(false);
  });

  it("should refresh only connected sources and measure a chosen workspace separately", async () => {
    const { request } = await fixture();
    await act(async () => action("workspaceManagement.refresh").click());
    const checks = request.mock.calls.map(([input]) => input).filter(input => input.type === "projectWorkspaces.changes.read");
    expect(checks).toEqual([{ type: "projectWorkspaces.changes.read", input: {
      projectId: "online", workspaceId: "online-workspace", sourceId: "online", workspacePath: "/online/feature"
    } }]);
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.diskUsage.read")).toBe(false);
    const online = container.querySelector('section[aria-label="online"]')!;
    await act(async () => action("workspaceDiskUsage.measure", online).click());
    expect(online.textContent).toContain("1 KiB");
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.diskUsage.read", input: {
      projectId: "online", workspaceId: "online-workspace", sourceId: "online", workspacePath: "/online/feature"
    } });
  });

  it("should reuse workspace management without changing an existing chat's workspace", async () => {
    const { app, request } = await fixture();
    await act(async () => action("workspaceHome.manage", container.querySelector('section[aria-label="online"]')!).click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("workspaceManagement.title");
    expect(app.projectsStore.projectStoresById.has("online")).toBe(true);
    expect(request.mock.calls.some(([input]) => input.type === "threads.workspace.select")).toBe(false);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Feature online");
  });

  it("should open the selected project and request its conversations with the explicit source", async () => {
    const { app, request } = await fixture();
    await act(async () => action("workspaceHome.openProject", container.querySelector('section[aria-label="online"]')!).click());
    expect(app.projectsStore.projectStoresById.has("online")).toBe(true);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      type: "threads.list", projectPath: "/online", sourceId: "online", scope: "currentProject"
    }));
    expect(request.mock.calls.some(([input]) => input.type === "threads.workspace.select")).toBe(false);
  });
});
