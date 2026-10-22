// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { WorkspaceRelocateDialogX } from "../src/components/projects/WorkspaceRelocateDialog";

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

/** Finds the relocation action separately from the dialog's cancel button. */
function relocateButton(): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find(button => button.textContent === "workspaces.relocate")!;
}

/** Keeps component events real while isolating the store's transport-backed operation. */
async function renderDialog(unsaved = false, current = workspace) {
  const relocate = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const project = { isReadOnlyFromCache: false,
    files: { hasUnsavedWorkspaceDocuments: () => unsaved },
    workspaces: { workspaces: [current], isBusy: false, error: null, relocate }
  } as unknown as ProjectStore;
  await act(async () => {
    root.render(<WorkspaceRelocateDialogX project={project} workspace={current} onClose={onClose} />);
  });
  return { relocate, onClose };
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

describe("workspace relocation confirmation", () => {
  it("should require a new destination and an explicit identity confirmation", async () => {
    const { relocate, onClose } = await renderDialog();
    expect(relocateButton().disabled).toBe(true);
    await confirmName("/moved");
    expect(relocateButton().disabled).toBe(true);
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    expect(relocateButton().disabled).toBe(false);
    await act(async () => { relocateButton().click(); });
    expect(relocate).toHaveBeenCalledWith("workspace", "/moved", true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("should reset confirmation after changing the destination", async () => {
    await renderDialog();
    await confirmName("/first");
    await act(async () => { document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await confirmName("/second");
    expect(relocateButton().disabled).toBe(true);
  });

  it("should prevent relocation with unsaved editor documents", async () => {
    const { relocate } = await renderDialog(true);
    expect(relocateButton().disabled).toBe(true);
    expect(document.body.textContent).toContain("workspaces.relocateUnsaved");
    expect(relocate).not.toHaveBeenCalled();
  });

  it("should expose the identity limitation when relocating the primary", async () => {
    await renderDialog(false, { ...workspace, isPrimary: true });
    expect(document.body.textContent).toContain("workspaces.relocatePrimaryHelp");
  });
});
