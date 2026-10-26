// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { PrimaryWorkspaceMoveDialogX } from "../src/components/projects/PrimaryWorkspaceMoveDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const workspace: OpenCodexProjectWorkspace = { id: "primary", projectId: "project", sourceId: "source",
  path: "/projects/example", isPrimary: true, managed: false, removedAt: null };
let root: Root;
let container: HTMLDivElement;

/** Finds the explicit final action, independently of the native-picker button. */
function moveButton(): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === "primaryWorkspaceMove.title")!;
}

/** Simulates a user edit through React's actual input event handling. */
async function changeDestination(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]:not([readonly])')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}

/** Keeps dialog state real and isolates only store/transport effects. */
async function renderDialog(options: { unsaved?: boolean; stale?: boolean; local?: boolean } = {}) {
  const move = vi.fn(async () => undefined);
  const pickMoveParent = vi.fn(async () => "/new-parent");
  const onClose = vi.fn();
  const project = { isReadOnlyFromCache: false, files: { hasUnsavedWorkspaceDocuments: () => options.unsaved === true },
    workspaces: { workspaces: [{ ...workspace, path: options.stale ? "/changed" : workspace.path }], isBusy: false, error: null,
      storageRoots: [{ id: "storage", label: "Storage", isDefault: true }], storagePreview: () => "/storage/project/primary",
      canPickMoveParent: options.local === true, pickMoveParent, move } } as unknown as ProjectStore;
  await act(async () => root.render(<PrimaryWorkspaceMoveDialogX project={project} workspace={workspace} onClose={onClose} />));
  return { move, pickMoveParent, onClose };
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("principal project destination selection", () => {
  it("should default to a free destination and require explicit confirmation of the reviewed path", async () => {
    const { move, onClose } = await renderDialog();
    expect(document.querySelector<HTMLInputElement>('input[type="text"]:not([readonly])')!.value).toBe("");
    expect(document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
    await changeDestination("/new-project");
    expect(moveButton().disabled).toBe(true);
    await act(async () => document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click());
    await act(async () => moveButton().click());
    expect(move).toHaveBeenCalledWith("primary", undefined, "/new-project", "/projects/example");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should offer configured storage only after the user selects the optional shortcut", async () => {
    const { move } = await renderDialog();
    await act(async () => document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!.click());
    expect(document.querySelector('input[type="text"]:not([readonly])')).toBeNull();
    expect([...document.querySelectorAll<HTMLInputElement>('input[readonly]')].some(input => input.value === "/storage/project/primary")).toBe(true);
    await act(async () => document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click());
    await act(async () => moveButton().click());
    expect(move).toHaveBeenCalledWith("primary", "storage", undefined, "/projects/example");
  });

  it("should pick a parent only for a local source and leave the final path editable and unconfirmed", async () => {
    const { pickMoveParent, move } = await renderDialog({ local: true });
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find(item => item.textContent === "primaryWorkspaceMove.browseParent")!.click());
    expect(pickMoveParent).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLInputElement>('input[type="text"]:not([readonly])')!.value).toBe("/new-parent/example");
    expect(moveButton().disabled).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });

  it.each(["unsaved", "stale"])("should block movement when the project is %s", async reason => {
    const { move } = await renderDialog({ unsaved: reason === "unsaved", stale: reason === "stale" });
    expect(moveButton().disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[type="text"]:not([readonly])')!.disabled).toBe(true);
    expect(move).not.toHaveBeenCalled();
  });
});
