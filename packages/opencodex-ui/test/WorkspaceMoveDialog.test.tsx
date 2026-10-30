// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { WorkspaceMoveDialogX } from "../src/components/projects/WorkspaceMoveDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const workspace: OpenCodexProjectWorkspace = { id: "workspace", projectId: "project", sourceId: "source",
  path: "/current/project/workspace", name: "Feature", managed: true, isPrimary: false, removedAt: null };
let root: Root;
let container: HTMLDivElement;

/** Changes the actual confirmation input through React's browser event handling. */
async function confirmName(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]:not([readonly])')!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Finds the relocation action separately from the dialog's cancel button. */
function moveButton(): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent === "workspaces.move")!;
}

/** Keeps component events real while isolating the store's transport-backed operation. */
async function renderDialog(unsaved = false, current = workspace, roots = [
  { id: "current", isDefault: true, label: "Current" }, { id: "other", isDefault: false, label: "Other" }
]) {
  const move = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const project = { isReadOnlyFromCache: false,
    files: { hasUnsavedWorkspaceDocuments: () => unsaved },
    workspaces: { workspaces: [current], isBusy: false, error: null, move, storageRoots: roots,
      storagePreview: (rootId: string, id: string) => `/${rootId}/project/${id}` }
  } as unknown as ProjectStore;
  await act(async () => {
    root.render(<WorkspaceMoveDialogX project={project} workspace={current} onClose={onClose} />);
  });
  return { move, onClose };
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

describe("workspace move destination choices", () => {
  it("should prefer another configured storage and send its identity rather than the preview path", async () => {
    const { move, onClose } = await renderDialog();
    expect(document.querySelector('input[type="text"]:not([readonly])')).toBeNull();
    expect([...document.querySelectorAll<HTMLInputElement>('input[readonly]')].some(input => input.value === "/other/project/workspace")).toBe(true);
    expect(moveButton().disabled).toBe(true);
    await act(async () => { document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click(); });
    expect(moveButton().disabled).toBe(false);
    await act(async () => { moveButton().click(); });
    expect(move).toHaveBeenCalledWith("workspace", "other");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should expose a free destination only after explicitly enabling the advanced option", async () => {
    const { move } = await renderDialog();
    await act(async () => { document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[0]!.click(); });
    await confirmName("/custom");
    await act(async () => { document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click(); });
    await act(async () => { moveButton().click(); });
    expect(move).toHaveBeenCalledWith("workspace", undefined, "/custom");
  });

  it("should keep configured storage first when no other location has been configured", async () => {
    await renderDialog(false, workspace, [{ id: "current", isDefault: true, label: "Current" }]);
    expect(document.body.textContent).toContain("workspaces.moveConfigureStorage");
    expect(document.querySelector('input[type="text"]:not([readonly])')).toBeNull();
    expect(moveButton().disabled).toBe(true);
  });

  it("should move an imported workspace only after destination confirmation and explain its retained ownership", async () => {
    const { move, onClose } = await renderDialog(false, { ...workspace, managed: false });
    expect(document.body.textContent).toContain("workspaces.moveImportedHelp");
    expect(moveButton().disabled).toBe(true);
    await act(async () => { document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]!.click(); });
    expect(moveButton().disabled).toBe(false);
    await act(async () => { moveButton().click(); });
    expect(move).toHaveBeenCalledWith("workspace", "other");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should still disable movement for imported workspaces with unsaved documents", async () => {
    const { move } = await renderDialog(true, { ...workspace, managed: false });
    expect(moveButton().disabled).toBe(true);
    expect(document.body.textContent).toContain("workspaces.moveUnsaved");
    expect(move).not.toHaveBeenCalled();
  });
});
