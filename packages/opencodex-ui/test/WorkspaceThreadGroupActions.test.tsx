// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceThreadGroupX } from "../src/components/projects/WorkspaceThreadGroup";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

let root: Root;
let container: HTMLDivElement;

/** Finds a contextual action without depending on MUI's generated class names. */
function menuItem(label: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find(item => item.textContent === label);
}

/** Opens the real workspace menu while isolating filesystem and transport-backed operations. */
async function renderMenu(managed: boolean, lockedReason: string | null | undefined, removedAt: string | null = null) {
  const workspace: OpenCodexProjectWorkspace = {
    id: "secondary", projectId: "project", sourceId: "source", path: "/secondary",
    isPrimary: false, managed, removedAt
  };
  const move = vi.fn(async () => undefined);
  const lockStates = new Map();
  if (lockedReason !== undefined) {
    lockStates.set(workspace.id, { workspaceId: workspace.id, sourceId: workspace.sourceId,
      workspacePath: workspace.path, supported: true, lockedReason });
  }
  const project = {
    isReadOnlyFromCache: false,
    files: { hasUnsavedWorkspaceDocuments: () => false },
    threadListStore: { isCreatingThread: false },
    workspaces: {
      workspaces: [workspace], isBusy: false, error: null, lockStates, loadingLockIds: new Set(),
      loadLockState: vi.fn(async () => undefined), move,
      storageRoots: [{ id: "storage", label: "Storage", isDefault: true }],
      storagePreview: () => "/storage/project/secondary"
    }
  } as unknown as ProjectStore;
  await act(async () => {
    root.render(<WorkspaceThreadGroupX project={project} root={{} as RootStore}
      group={{ id: workspace.id, path: workspace.path, workspace, threads: [] }} onOpenSubAgentDialog={vi.fn()} />);
  });
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="workspaces.actions"]')!.click());
  return { move };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("contextual secondary workspace movement", () => {
  it.each([true, false])("should offer movement independently of deletion ownership (managed: %s)", async (managed) => {
    const { move } = await renderMenu(managed, null);
    expect(menuItem("workspaces.move")?.getAttribute("aria-disabled")).not.toBe("true");
    expect(menuItem("workspaces.move")).toBeDefined();
    expect(menuItem("workspaces.remove") !== undefined).toBe(managed);
    await act(async () => menuItem("workspaces.move")!.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent?.includes("workspaces.moveImportedHelp")).toBe(!managed);
    expect(move).not.toHaveBeenCalled();
    await act(async () => dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click());
    await act(async () => {
      Array.from(dialog.querySelectorAll<HTMLButtonElement>("button"))
        .find(item => item.textContent === "workspaces.move")!.click();
    });
    expect(move).toHaveBeenCalledWith("secondary", "storage");
  });

  it.each(["External lock", undefined])("should disable imported movement for a locked or unknown state (%s)", async (reason) => {
    await renderMenu(false, reason);
    expect(menuItem("workspaces.move")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("should hide physical movement for a deleted workspace", async () => {
    await renderMenu(false, null, "2026-10-30T12:00:00Z");
    expect(menuItem("workspaces.move")).toBeUndefined();
    expect(menuItem("workspaces.remove")).toBeUndefined();
  });
});
