// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectGitSyncActionX } from "../src/components/projects/ProjectGitSyncAction";
import { ProjectGitActionsMenuX } from "../src/components/projects/ProjectGitActionsMenu";
import { ProjectGitRemoteDialogX } from "../src/components/projects/ProjectGitRemoteDialog";
import { createGitSyncStoreFixture, syncInspection, syncResult } from "./ProjectGitSyncStore.fixture";
import { createDeferred, createRemote } from "./ProjectGitReferencesStore.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (input: string | string[], values?: { name?: string; count?: number }) => {
  const key = Array.isArray(input) ? input[input.length - 1] : input;
  if (values?.count !== undefined) return `${key}:${values.count}`;
  if (values?.name !== undefined) return `${key} ${values.name}`;
  return key;
} }) }));

let root: Root;
let container: HTMLDivElement;
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

/** Selects real accessible actions rather than presentation wrappers. */
function action(label: string): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"]')]
    .find(item => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
  if (element === undefined) throw new Error(`Missing action: ${label}`);
  return element;
}

describe("simple Git interaction", () => {
  it("should send directly and offer advanced review only after a structured rejection", async () => {
    const test = createGitSyncStoreFixture();
    test.request.mockResolvedValueOnce({ ...syncResult("blocked"), issue: "advancedRequired" });
    await act(async () => root.render(<ProjectGitSyncActionX gitStore={test.gitStore} onOpenFile={vi.fn()} />));
    expect(document.body.textContent).not.toContain("gitSync.open");

    await act(async () => action("git.pushChanges:1").click());

    expect(test.request.mock.calls.map(([request]) => request.type)).toEqual(["git.sync.simple"]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain("gitSync.issues.advancedRequired");
    await act(async () => action("gitSync.open").click());
    expect(test.request.mock.calls.map(([request]) => request.type)).toEqual([
      "git.sync.simple", "git.sync.inspect", "git.sync.plan"
    ]);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("should expose advanced synchronization through the actions menu without executing it", async () => {
    const test = createGitSyncStoreFixture();
    const openAdvanced = vi.fn();
    const close = vi.fn();
    await act(async () => root.render(<ProjectGitActionsMenuX anchorEl={container}
      referencesStore={test.gitStore.referencesStore} statusStore={test.gitStore.statusStore} isAvailable
      onClose={close} onOpenBranch={vi.fn()} onOpenProtection={vi.fn()} onOpenMerge={vi.fn()}
      onOpenRemote={vi.fn()} onOpenLog={vi.fn()} onSynchronize={vi.fn()} onAdvancedSync={openAdvanced} />));

    await act(async () => action("gitSync.open").click());

    expect(close).toHaveBeenCalledOnce();
    expect(openAdvanced).toHaveBeenCalledOnce();
    expect(test.request).not.toHaveBeenCalled();
  });

  it("should select a favorite directly in the repository list and preserve the branch override", async () => {
    const test = createGitSyncStoreFixture();
    const remotes = [createRemote("origin"), createRemote("backup")];
    const inspection = syncInspection();
    inspection.status.remotes = remotes;
    inspection.status.synchronization = {
      favoriteRemote: "origin", branchRemote: "origin", target: { remoteName: "origin", branchName: "dev" }
    };
    test.gitStore.statusStore.applyStatus(inspection.status);
    test.request.mockImplementation(async request => {
      if (request.type === "git.remotes") return remotes;
      if (request.type === "git.sync.configure") {
        return syncResult("inspected", { ...inspection, status: { ...inspection.status, synchronization: {
          ...inspection.status.synchronization!, favoriteRemote: request.favoriteRemote!
        } } });
      }
      throw new Error(`Unexpected request ${request.type}`);
    });
    await act(async () => root.render(<ProjectGitRemoteDialogX open onClose={vi.fn()}
      syncStore={test.sync} referencesStore={test.gitStore.referencesStore} />));

    await act(async () => action("gitSync.favoriteAction backup").click());

    expect(test.request).toHaveBeenCalledWith({ type: "git.sync.configure", favoriteRemote: "backup", branchName: "dev",
      projectId: "project-1", projectPath: "/workspace/project", sourceId: "source-1" });
    expect(action("gitSync.favoriteAction backup").getAttribute("aria-pressed")).toBe("true");
    expect(test.sync.configuration?.branchRemote).toBe("origin");
    expect(document.body.textContent).toContain("gitSync.branchOptions");
  });

  it("should keep the repository editor open while saving a favorite", async () => {
    const test = createGitSyncStoreFixture();
    const saving = createDeferred<ReturnType<typeof syncResult>>();
    const onClose = vi.fn();
    test.request.mockImplementation(request => {
      if (request.type === "git.remotes") return Promise.resolve([createRemote("origin")]);
      return saving.promise;
    });
    await act(async () => root.render(<ProjectGitRemoteDialogX open onClose={onClose}
      syncStore={test.sync} referencesStore={test.gitStore.referencesStore} />));

    await act(async () => action("gitSync.favoriteAction origin").click());
    const close = action("git.close") as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    await act(async () => close.click());
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => saving.resolve(syncResult("inspected")));
    expect(close.disabled).toBe(false);
    await act(async () => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
