// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { WorkspacePreparationDialogX } from "../src/components/projects/WorkspacePreparationDialog";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../src/components/projects/ProjectCommandDialog", () => ({ ProjectCommandDialogX: () => null }));
let root: Root;
let container: HTMLDivElement;

/** Locates a visible action by its translated key. */
function button(key: string): HTMLButtonElement {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === key)!;
}

/** Keeps observable workspace changes real while isolating transport and the existing command editor. */
async function renderDialog(unsaved = false) {
  const command = { id: "prepare", projectId: "project", name: "Install", command: "npm ci",
    executionMode: "workspace", persistLogs: false, updatedAt: "2026-10-22", createdAt: "2026-10-22", sortOrder: 0 };
  const workspace = observable({ id: "B", projectId: "project", sourceId: "source", path: "/worktrees/B",
    isPrimary: false, managed: true, name: "Feature", removedAt: null, movePending: false });
  const runPreparation = vi.fn(async () => ({}));
  const setPreparationCommand = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const project = { project: { id: "project", sourceId: "source", preferences: { workspacePreparation: { commandId: "prepare" } } },
    workspacePath: "/primary", isReadOnlyFromCache: false, workspaces: { workspaces: [workspace] },
    files: { hasUnsavedWorkspaceDocuments: () => unsaved }, commandsStore: {
      commands: [command], isAvailable: true, isLoading: false, isSaving: false,
      loadCommands: vi.fn(async () => undefined), getRuns: () => [], runPreparation, setPreparationCommand
    } } as unknown as ProjectStore;
  await act(async () => { root.render(<WorkspacePreparationDialogX project={project} workspace={workspace} onClose={onClose} />); });
  return { project, workspace, runPreparation, setPreparationCommand, onClose };
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

describe("workspace preparation confirmation", () => {
  it("should show the script and run only after confirming the named workspace independently of the selected chat", async () => {
    const { runPreparation, setPreparationCommand } = await renderDialog();
    expect(document.querySelector<HTMLTextAreaElement>("textarea[readonly]")?.value).toBe("npm ci");
    expect(runPreparation).not.toHaveBeenCalled();
    expect(setPreparationCommand).not.toHaveBeenCalled();
    await act(async () => { button("workspacePreparation.run").click(); });
    expect(runPreparation).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "B", workspacePath: "/worktrees/B",
      sourceId: "source", command: expect.objectContaining({ command: "npm ci" }) }));
  });

  it("should block preparation while workspace documents have unsaved changes", async () => {
    const { runPreparation } = await renderDialog(true);
    expect(button("workspacePreparation.run").disabled).toBe(true);
    expect(document.body.textContent).toContain("workspacePreparation.unsaved");
    expect(runPreparation).not.toHaveBeenCalled();
  });

  it("should require a new destination review after a workspace moves", async () => {
    const { workspace, runPreparation } = await renderDialog();
    await act(async () => { runInAction(() => { workspace.path = "/moved/B"; }); });
    expect(button("workspacePreparation.run").disabled).toBe(true);
    expect(document.body.textContent).toContain("workspacePreparation.unavailable");
    expect(runPreparation).not.toHaveBeenCalled();
  });

  it("should save a disabled hook without running any command", async () => {
    const { runPreparation, setPreparationCommand } = await renderDialog();
    await act(async () => {
      document.querySelector('[role="combobox"]')!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
    await act(async () => {
      [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === "workspacePreparation.none")!.click();
    });
    expect(button("workspacePreparation.run").disabled).toBe(true);
    await act(async () => { button("workspacePreparation.save").click(); });
    expect(setPreparationCommand).toHaveBeenCalledWith(null);
    expect(runPreparation).not.toHaveBeenCalled();
  });

  it("should keep a rejected launch visible without retrying or closing the dialog", async () => {
    const { runPreparation, onClose } = await renderDialog();
    runPreparation.mockRejectedValueOnce(new Error("Trust the project"));
    await act(async () => { button("workspacePreparation.run").click(); });
    expect(document.body.textContent).toContain("Trust the project");
    expect(runPreparation).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
