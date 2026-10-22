// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { WorkspaceManagementDialogX } from "../src/components/projects/WorkspaceManagementDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "fr" } }) }));
let root: Root;
let container: HTMLDivElement;

/** Locates actions by translation key without depending on styling or generated MUI classes. */
function button(key: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === key)!;
}

/** Real dialog state and confirmation controls with isolated transport-backed store operations. */
async function renderDialog() {
  const workspace: OpenCodexProjectWorkspace = { id: "B", projectId: "project", sourceId: "source",
    path: "/B", name: "Feature", isPrimary: false, managed: true, removedAt: null };
  const refreshManagement = vi.fn(async () => undefined);
  const remove = vi.fn(async () => undefined);
  const project = observable({ project: { id: "project", sourceId: "source" },
    isReadOnlyFromCache: false, isCodexSourceReady: true, hasRunningChatIndicator: false, hasActiveDebugSession: false,
    commandsStore: { hasActiveRun: false }, composeStore: { hasNonStoppedContainer: false, pendingServiceNames: new Set() },
    files: { hasUnsavedWorkspaceDocuments: () => false }, workspaces: {
      workspaces: [workspace], isBusy: false, error: null, isRefreshingManagement: false, refreshManagement, remove,
      loadingLockIds: new Set(), lockStates: new Map([["B", { workspaceId: "B", sourceId: "source", workspacePath: "/B",
        supported: true, lockedReason: null as string | null }]]), activityById: new Map([["B", { workspaceId: "B",
        sourceId: "source", workspacePath: "/B", lastActivityAt: "2026-01-01T00:00:00Z", conversationCount: 2,
        activeConversationCount: 0, pendingOperationCount: 0 }]])
    } });
  const onClose = vi.fn();
  await act(async () => { root.render(<WorkspaceManagementDialogX project={project as unknown as ProjectStore} onClose={onClose} />); });
  return { project, refreshManagement, remove, onClose };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-22T12:00:00Z"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workspace management and manual cleanup", () => {
  it("should refresh evidence without deleting anything and require the existing name confirmation", async () => {
    const { refreshManagement, remove } = await renderDialog();
    expect(refreshManagement).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain("workspaceManagement.status.candidate");
    expect(remove).not.toHaveBeenCalled();
    await act(async () => { button("workspaceManagement.inspectRemoval").click(); });
    expect(button("workspaces.remove").disabled).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    const input = document.querySelector<HTMLInputElement>('input[autocomplete="off"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "Feature"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { button("workspaces.remove").click(); });
    expect(remove).toHaveBeenCalledWith("B");
  });

  it("should remove a checkout from the candidate filter when it becomes locked", async () => {
    const { project, remove } = await renderDialog();
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    await act(async () => checkbox.click());
    expect(document.body.textContent).toContain("Feature");
    await act(async () => { runInAction(() => { project.workspaces.lockStates.get("B")!.lockedReason = "Keep"; }); });
    expect(document.body.textContent).not.toContain("Feature");
    expect(document.body.textContent).toContain("workspaceManagement.empty");
    expect(remove).not.toHaveBeenCalled();
  });

  it("should retain readable cached activity when its source is offline and hide removal actions", async () => {
    const { project, remove } = await renderDialog();
    await act(async () => { runInAction(() => { project.isCodexSourceReady = false; }); });
    expect(document.body.textContent).toContain("workspaceManagement.status.offline");
    expect(document.body.textContent).toContain("workspaceManagement.lastActivity");
    expect(button("workspaceManagement.inspectRemoval")).toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });

  it("should exclude local project tools and source changes even when old snapshots remain cached", async () => {
    const { project } = await renderDialog();
    await act(async () => { runInAction(() => { project.commandsStore.hasActiveRun = true; }); });
    expect(document.body.textContent).toContain("workspaceManagement.status.busy");
    expect(button("workspaceManagement.inspectRemoval")).toBeUndefined();
    await act(async () => { runInAction(() => {
      project.commandsStore.hasActiveRun = false; project.project.sourceId = "other-source";
    }); });
    expect(document.body.textContent).toContain("workspaceManagement.status.offline");
    expect(button("workspaceManagement.inspectRemoval")).toBeUndefined();
  });
});
