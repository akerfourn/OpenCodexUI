// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { WorkspaceRemoveDialogX } from "../src/components/projects/WorkspaceRemoveDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const workspace: OpenCodexProjectWorkspace = { id: "workspace", projectId: "project", sourceId: "source",
  path: "/checkout", name: "Feature", managed: true, isPrimary: false, removedAt: null };
let root: Root;
let container: HTMLDivElement;

/** Changes the actual confirmation input through React's browser event handling. */
async function confirmName(value: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("input:not([readonly])")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Finds the irreversible action separately from the dialog's cancel button. */
function removeButton(): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent === "workspaces.remove")!;
}

/** Keeps component events real while isolating the store's transport-backed operation. */
async function renderDialog(unsaved = false, current = workspace) {
  const remove = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const project = { isReadOnlyFromCache: false,
    files: { hasUnsavedWorkspaceDocuments: () => unsaved },
    workspaces: { workspaces: [current], isBusy: false, error: null, remove }
  } as unknown as ProjectStore;
  await act(async () => {
    root.render(<WorkspaceRemoveDialogX project={project} workspace={current} onClose={onClose} />);
  });
  return { remove, onClose };
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

describe("workspace deletion confirmation", () => {
  it("should require the exact workspace name before sending the destructive action", async () => {
    const { remove, onClose } = await renderDialog();
    expect(removeButton().disabled).toBe(true);
    await confirmName("Feature ");
    expect(removeButton().disabled).toBe(true);
    await confirmName("Feature");
    expect(removeButton().disabled).toBe(false);
    await act(async () => { removeButton().click(); });
    expect(remove).toHaveBeenCalledWith("workspace");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should keep deletion disabled when unsaved editor content exists", async () => {
    const { remove } = await renderDialog(true);
    await confirmName("Feature");
    expect(removeButton().disabled).toBe(true);
    expect(document.body.textContent).toContain("workspaces.removeUnsaved");
    expect(remove).not.toHaveBeenCalled();
  });

  it("should reject an external checkout even if the confirmation dialog is opened directly", async () => {
    await renderDialog(false, { ...workspace, managed: false });
    await confirmName("Feature");
    expect(removeButton().disabled).toBe(true);
  });
});
