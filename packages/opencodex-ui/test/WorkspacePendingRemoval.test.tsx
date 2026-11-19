// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexWorkspaceRemoval, OpenCodexWorkspaceRemovalFile } from "@open-codex-ui/opencodex-protocol";
import type { ProjectWorkspacesStore } from "../src/stores/project/ProjectWorkspacesStore";
import { WorkspacePendingRemovalX } from "../src/components/projects/WorkspacePendingRemoval";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const removal: OpenCodexWorkspaceRemoval = { id: "request", projectId: "project", workspaceId: "workspace",
  sourceId: "source", primaryWorkspaceId: "primary", projectPath: "/repo", workspacePath: "/checkout",
  repositoryPath: "/repo/.git", state: "preparing", gitExitCode: null, deferredState: "queued" };
let root: Root;
let container: HTMLDivElement;

/** Finds public actions without coupling assertions to MUI's generated markup. */
function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label);
}

/** Isolates transport while preserving actual action buttons, disabled states and error presentation. */
async function renderRemoval(current = removal, offline = false, files: OpenCodexWorkspaceRemovalFile[] = []) {
  const actions = { isBusy: false, error: null, workspaces: [],
    inspectRemoval: vi.fn(async () => ({ projectId: "project", workspaceId: "workspace", sourceId: "source",
      workspacePath: "/checkout", files, totalFileCount: files.length })),
    cancelDeferredRemoval: vi.fn(), retryDeferredRemoval: vi.fn(), recoverRemoval: vi.fn() };
  await act(async () => root.render(<WorkspacePendingRemovalX removal={current}
    store={actions as unknown as ProjectWorkspacesStore} disabled={offline} compact />));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="workspaces.removalDetails"]')!.click());
  return actions;
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

describe("pending deletion controls", () => {
  it("should require file-loss consent and the workspace identity before escalating a blocked request", async () => {
    const actions = await renderRemoval({ ...removal, deferredState: "blocked", blockedReason: "Local files" }, false,
      [{ path: "cache/", kind: "ignored" }]);
    expect(document.body.textContent).toContain("cache/");
    expect(button("workspaces.retryRemoval")?.disabled).toBe(true);
    const label = [...document.querySelectorAll("label")].find(item => item.textContent?.includes("workspaces.forceRemovalConfirm"))!;
    await act(async () => label.querySelector<HTMLInputElement>("input")!.click());
    expect(button("workspaces.forceRemovalAction")?.disabled).toBe(true);
    const input = document.querySelector<HTMLInputElement>('input[type="text"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "workspace");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("workspaces.forceRemovalAction")!.click());
    expect(actions.retryDeferredRemoval).toHaveBeenCalledWith("request", true);
  });
  it("should explain waiting and allow cancellation while the source is offline", async () => {
    const actions = await renderRemoval(removal, true);
    expect(document.body.textContent).toContain("workspaces.deferredRemovalWaiting");
    expect(button("workspaces.cancelRemoval")?.disabled).toBe(false);
    expect(button("workspaces.recover")).toBeUndefined();
    await act(async () => button("workspaces.cancelRemoval")!.click());
    expect(actions.cancelDeferredRemoval).toHaveBeenCalledWith("request");
  });

  it("should display the safety failure and offer explicit retry for blocked intent", async () => {
    const actions = await renderRemoval({ ...removal, deferredState: "blocked", blockedReason: "Keep modified files" });
    expect(document.body.textContent).toContain("workspaces.deferredRemovalBlocked");
    expect(document.body.textContent).toContain("Keep modified files");
    await act(async () => button("workspaces.retryRemoval")!.click());
    expect(actions.retryDeferredRemoval).toHaveBeenCalledWith("request");
  });

  it("should expose verification instead of cancellation or automatic retry after ambiguous dispatch", async () => {
    const actions = await renderRemoval({ ...removal, deferredState: "processing", state: "uncertain" });
    expect(button("workspaces.cancelRemoval")).toBeUndefined();
    expect(button("workspaces.retryRemoval")).toBeUndefined();
    await act(async () => button("workspaces.recover")!.click());
    expect(actions.recoverRemoval).toHaveBeenCalledWith("request");
  });

  it("should localize a dirty-workspace refusal while retaining the original diagnostic in collapsed details", async () => {
    const blockedReason = "Workspace contains modified, untracked or ignored files. Save or remove them before deleting it.";
    await renderRemoval({ ...removal, deferredState: "blocked", blockedReason });
    const details = document.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain(blockedReason);
    expect(details.closest('[role="alert"]')?.querySelector("p")?.textContent).toBe("workspaces.removeDirty");
  });
});
