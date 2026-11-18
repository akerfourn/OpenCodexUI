// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
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
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label);
}

/** Isolates transport while preserving actual action buttons, disabled states and error presentation. */
async function renderRemoval(current = removal, offline = false) {
  const actions = { isBusy: false, cancelDeferredRemoval: vi.fn(), retryDeferredRemoval: vi.fn(), recoverRemoval: vi.fn() };
  await act(async () => root.render(<WorkspacePendingRemovalX removal={current}
    store={actions as unknown as ProjectWorkspacesStore} disabled={offline} />));
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
  it("should explain waiting and allow cancellation while the source is offline", async () => {
    const actions = await renderRemoval(removal, true);
    expect(container.textContent).toContain("workspaces.deferredRemovalWaiting");
    expect(button("workspaces.cancelRemoval")?.disabled).toBe(false);
    expect(button("workspaces.recover")).toBeUndefined();
    await act(async () => button("workspaces.cancelRemoval")!.click());
    expect(actions.cancelDeferredRemoval).toHaveBeenCalledWith("request");
  });

  it("should display the safety failure and offer explicit retry for blocked intent", async () => {
    const actions = await renderRemoval({ ...removal, deferredState: "blocked", blockedReason: "Keep modified files" });
    expect(container.textContent).toContain("workspaces.deferredRemovalBlocked");
    expect(container.textContent).toContain("Keep modified files");
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
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain(blockedReason);
    expect(details.closest('[role="alert"]')?.querySelector("p")?.textContent).toBe("workspaces.removeDirty");
  });
});
