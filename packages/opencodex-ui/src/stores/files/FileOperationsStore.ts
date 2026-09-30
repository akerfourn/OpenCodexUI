import { makeAutoObservable, observable, runInAction } from "mobx";
import type { OpenCodexFileRequest, OpenCodexFileResult, OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { FileDocumentError } from "./FileDocument";
import type { ProjectFilesStore } from "./ProjectFilesStore";
import type { WorkspaceTreeStore } from "./WorkspaceTreeStore";

/** Captured operation context remains valid when the selected workspace changes. */
export interface FileOperationDialogState {
  kind: "copy" | "rename" | "delete";
  tree: WorkspaceTreeStore;
  target: OpenCodexFileTarget;
  destinationPath: string;
  isSymbolicLink?: boolean;
}

/** Internal filesystem clipboard and explicit, source-scoped mutation dialogs. */
export class FileOperationsStore {
  /** Only references are copied; pasting reads the current source bytes. */
  clipboard: OpenCodexFileTarget | null = null;
  /** Active dialog owns its immutable source and destination context. */
  dialog: FileOperationDialogState | null = null;
  /** Editable destination basename for copy and rename. */
  name = "";
  /** Locks the dialog and prevents overlapping operations. */
  isBusy = false;
  /** Structured failures retain the dialog and user input for correction. */
  error: FileDocumentError | null = null;

  /** Shares document protection and transport with the owning project. */
  constructor(private readonly files: ProjectFilesStore, private readonly root: RootStore) {
    makeAutoObservable<this, "files" | "root">(this, {
      files: false, root: false, dialog: observable.ref
    });
  }

  /** Copies a detached source reference without touching the system clipboard. */
  copy(tree: WorkspaceTreeStore, path: string): void {
    if (this.isBusy || path.length === 0) return;
    this.clipboard = { ...tree.context, path };
  }

  /** Cross-workspace transfers are deliberately excluded from this source-local clipboard. */
  canPaste(tree: WorkspaceTreeStore): boolean {
    const source = this.clipboard;
    const context = tree.context;
    return !this.isBusy && source !== null && source.sourceId === context.sourceId &&
      source.projectId === context.projectId && source.workspaceId === context.workspaceId &&
      source.workspacePath === context.workspacePath;
  }

  /** Opens a copy dialog for the captured destination directory, including the root. */
  paste(tree: WorkspaceTreeStore, destinationPath: string): void {
    if (!this.canPaste(tree) || this.clipboard === null) return;
    this.show({ kind: "copy", tree, target: { ...this.clipboard }, destinationPath });
  }

  /** Opens a rename or permanent-delete confirmation for a single tree entry. */
  select(kind: "rename" | "delete", tree: WorkspaceTreeStore, path: string, isSymbolicLink = false): void {
    if (this.isBusy || path.length === 0) return;
    this.show({ kind, tree, target: { ...tree.context, path }, destinationPath: parentPath(path), isSymbolicLink });
  }

  /** Updates only the proposed basename; validation remains source-owned. */
  setName(name: string): void {
    this.name = name;
  }

  /** Keeps an acknowledged operation visible until it finishes. */
  close(): void {
    if (this.isBusy) return;
    this.dialog = null;
    this.error = null;
  }

  /** Protects open buffers before sending a plain DTO to the owning source. */
  async submit(): Promise<void> {
    const dialog = this.dialog;
    if (dialog === null || this.isBusy || this.files.isDisposed) return;
    this.isBusy = true;
    this.error = null;
    const documents = this.files.documentsAt(dialog.target);
    let requested = false;
    try {
      if (dialog.kind !== "copy") {
        const accepted = await new Promise<boolean>(resolve => {
          this.root.fileCloseStore.request(documents, () => resolve(true), () => resolve(false));
        });
        if (!accepted || this.files.isDisposed) return;
      }
      const request = this.createRequest(dialog);
      requested = true;
      const result = await this.root.request<OpenCodexFileResult<{ path: string }>>(request);
      if (!result.ok) {
        runInAction(() => { this.error = result; });
        return;
      }
      if (this.files.isDisposed) return;
      if (dialog.kind !== "copy") {
        await this.files.completeEntryMutation(documents, dialog.target,
          dialog.kind === "rename" ? result.value.path : null);
        dialog.tree.relocateExpansion(dialog.target.path, dialog.kind === "rename" ? result.value.path : null);
      } else {
        runInAction(() => { dialog.tree.expanded.add(dialog.destinationPath); });
      }
      runInAction(() => {
        this.dialog = null;
        if (dialog.kind !== "copy") this.clipboard = null;
      });
    } catch (error) {
      runInAction(() => { this.error = { code: "unavailable", details: String(error) }; });
    } finally {
      runInAction(() => { this.isBusy = false; });
      if (requested && !this.files.isDisposed) {
        dialog.tree.refresh();
        this.files.refreshGitStatus(dialog.target);
      }
    }
  }

  /** Initializes a new dialog without carrying over a previous error. */
  private show(dialog: FileOperationDialogState): void {
    this.dialog = dialog;
    this.name = dialog.target.path.split("/").at(-1) ?? "";
    this.error = null;
  }

  /** Builds transport payloads from detached scalar values only. */
  private createRequest(dialog: FileOperationDialogState): OpenCodexFileRequest {
    const target = { ...dialog.target };
    if (dialog.kind === "delete") return { type: "workspaceFiles.delete", target };
    if (dialog.kind === "rename") return { type: "workspaceFiles.rename", target, name: this.name };
    return { type: "workspaceFiles.copy", target, destinationPath: dialog.destinationPath, name: this.name };
  }
}

/** Returns a workspace-relative parent without applying host OS path rules. */
function parentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}
