// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexWorkspaceLockState } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { WorkspaceLockDialogX } from "../src/components/projects/WorkspaceLockDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const state: OpenCodexWorkspaceLockState = { workspaceId: "workspace", sourceId: "source", workspacePath: "/checkout",
  supported: true, lockedReason: null };
let root: Root;
let container: HTMLDivElement;

/** Finds the requested confirmation separately from the cancel action. */
function actionButton(key: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === key)!;
}

/** Isolates transport effects while keeping observable snapshot changes and actual UI events. */
async function renderDialog(snapshot = state, pending = false) {
  const setLock = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const lockStates = observable.map([[snapshot.workspaceId, snapshot]]);
  const project = { isReadOnlyFromCache: false, workspaces: { isBusy: false, error: null, setLock,
    lockStates, loadingLockIds: new Set(), workspaces: [{ id: "workspace", sourceId: "source", path: "/checkout",
      isPrimary: false, removedAt: null, movePending: pending }] } } as unknown as ProjectStore;
  await act(async () => { root.render(<WorkspaceLockDialogX project={project} state={snapshot} onClose={onClose} />); });
  return { setLock, onClose, lockStates };
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

describe("native workspace lock confirmation", () => {
  it("should send the reviewed unlocked state and an optional reason only after confirmation", async () => {
    const { setLock, onClose } = await renderDialog();
    const input = document.querySelector<HTMLInputElement>('input:not([readonly])')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(input, "Keep for later");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(setLock).not.toHaveBeenCalled();
    await act(async () => { actionButton("workspaces.lock").click(); });
    expect(setLock).toHaveBeenCalledWith(state, true, "Keep for later");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should display an external lock reason before confirming its removal", async () => {
    const snapshot = { ...state, lockedReason: "External backup" };
    const { setLock } = await renderDialog(snapshot);
    expect(document.querySelector<HTMLTextAreaElement>("textarea[readonly]")?.value).toBe("External backup");
    expect(setLock).not.toHaveBeenCalled();
    await act(async () => { actionButton("workspaces.unlock").click(); });
    expect(setLock).toHaveBeenCalledWith(snapshot, false, "");
  });

  it("should treat an empty reason as an existing lock", async () => {
    const snapshot = { ...state, lockedReason: "" };
    const { setLock } = await renderDialog(snapshot);
    await act(async () => { actionButton("workspaces.unlock").click(); });
    expect(setLock).toHaveBeenCalledWith(snapshot, false, "");
  });

  it("should require a new review if fresh Git metadata differs from the frozen confirmation", async () => {
    const { setLock, lockStates } = await renderDialog({ ...state, lockedReason: "Old external lock" });
    await act(async () => { runInAction(() => lockStates.set("workspace", { ...state, lockedReason: "New external lock" })); });
    expect(actionButton("workspaces.unlock").disabled).toBe(true);
    expect(document.body.textContent).toContain("workspaces.lockChanged");
    expect(setLock).not.toHaveBeenCalled();
  });

  it("should refuse lock changes while a physical movement is pending", async () => {
    const { setLock } = await renderDialog(state, true);
    expect(actionButton("workspaces.lock").disabled).toBe(true);
    expect(setLock).not.toHaveBeenCalled();
  });
});
