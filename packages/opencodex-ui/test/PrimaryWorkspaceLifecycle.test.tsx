// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";
import { WorkspaceThreadGroupX } from "../src/components/projects/WorkspaceThreadGroup";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "fr" } }) }));
let root: Root;
let container: HTMLDivElement;

/** Locates visible actions without relying on generated MUI class names. */
function button(key: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === key);
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

describe("permanent primary workspace UI", () => {
  it("should hide completion markers and actions while preserving relocation and properties", async () => {
    // Legacy payloads must not briefly expose a completed primary before the migrated catalogue arrives.
    const workspace: OpenCodexProjectWorkspace = { id: "primary", projectId: "project", sourceId: "source", path: "/repo",
      isPrimary: true, managed: false, removedAt: null, workStatus: "completed", completedAt: "2026-10-22T12:00:00Z" };
    const setWorkStatus = vi.fn();
    const project = { isReadOnlyFromCache: false, threadListStore: { isCreatingThread: false },
      files: { hasUnsavedWorkspaceDocuments: () => false }, workspaces: { workspaces: [workspace],
        isBusy: false, error: null, lockStates: new Map(), loadingLockIds: new Set(), setWorkStatus } } as unknown as ProjectStore;
    await act(async () => root.render(<WorkspaceThreadGroupX project={project} root={{} as RootStore}
      group={{ id: workspace.id, path: workspace.path, workspace, threads: [] }} onOpenSubAgentDialog={vi.fn()} />));
    expect(document.querySelector('[aria-label="workspaceWorkStatus.completed"]')).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="workspaces.actions"]')!.click());
    expect(document.body.textContent).not.toContain("workspaceWorkStatus.complete");
    expect(document.body.textContent).not.toContain("workspaceWorkStatus.reopen");
    expect(document.body.textContent).toContain("workspaces.relocate");
    const properties = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find(item => item.textContent === "workspaces.properties")!;
    await act(async () => properties.click());
    expect(document.body.textContent).toContain("workspaceWorkStatus.primaryHelp");
    expect(document.body.textContent).not.toContain("workspaceWorkStatus.completedAt");
    expect(button("workspaceWorkStatus.complete")).toBeUndefined();
    expect(button("workspaceWorkStatus.reopen")).toBeUndefined();
    expect(setWorkStatus).not.toHaveBeenCalled();
  });
});
