import { makeAutoObservable, observable, runInAction } from "mobx";
import type { OpenCodexFileContext, OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "../project/ProjectStore";
import { FileDocument, type DocumentPosition } from "./FileDocument";
import { type FileOpenIntent, resolveInitialFileView } from "./fileOpenIntent";
import { WorkspaceTreeStore } from "./WorkspaceTreeStore";
import { FileOperationsStore } from "./FileOperationsStore";

/** Project document catalogue independent of the right tool and viewer lifetime. */
export class ProjectFilesStore {
  /** Entry operations retain their clipboard and source context across tool navigation. */
  readonly operations: FileOperationsStore;
  /** Retained document instances keyed by their complete source identity. */
  readonly documents = observable.map<string, FileDocument>({}, { deep: false });
  /** Explorer instances retain expansion and isolate asynchronous results. */
  private readonly trees = new Map<string, WorkspaceTreeStore>();
  /** Last selected file, even while the chat is displayed. */
  activeId: string | null = null;
  /** Central content choice is independent of the selected project tool. */
  isVisible = false;
  /** Blocks late navigation after project shutdown. */
  isDisposed = false;

  /** Binds document requests and close protection to this project. */
  constructor(
    private readonly project: ProjectStore,
    private readonly root: RootStore
  ) {
    this.operations = new FileOperationsStore(this, root);
    makeAutoObservable<this, "project" | "root" | "trees">(this, {
      project: false,
      root: false,
      trees: false
    });
  }

  /** Selected document, retained even when the central chat is visible. */
  get active(): FileDocument | null {
    return this.documents.get(this.activeId ?? "") ?? null;
  }

  /** Resolves the current explorer without repurposing previously loaded state. */
  get tree(): WorkspaceTreeStore | null {
    const workspace = this.project.workspaces.current;
    if (workspace === null || workspace.sourceId === null) return null;
    const context = {
      projectId: this.project.project.id,
      workspaceId: workspace.id,
      sourceId: workspace.sourceId,
      workspacePath: workspace.path
    };
    const key = JSON.stringify(context);
    let tree = this.trees.get(key);
    if (tree === undefined) {
      tree = new WorkspaceTreeStore(Object.freeze(context), this.root);
      this.trees.set(key, tree);
    }
    return tree;
  }

  /** Rechecks permissions on open documents without discarding unsaved edits. */
  async refreshAccess(context: OpenCodexFileContext): Promise<void> {
    const documents = [...this.documents.values()].filter(document =>
      document.target?.workspaceId === context.workspaceId && document.target.sourceId === context.sourceId &&
      document.target.workspacePath === context.workspacePath);
    await Promise.all(documents.map(document => document.refreshAccess()));
  }

  /** Opens one source document; future tools can supply a source position. */
  async open(
    target: OpenCodexFileTarget,
    workspaceName: string,
    position?: DocumentPosition,
    intent: FileOpenIntent = { origin: "explorer" }
  ): Promise<void> {
    const id = JSON.stringify([
      target.sourceId,
      target.projectId,
      target.workspaceId,
      target.workspacePath,
      target.path
    ]);
    let document = this.documents.get(id);
    if (document === undefined) {
      document = new FileDocument(
        id,
        target.path.split("/").at(-1) ?? target.path,
        Object.freeze({ ...target }),
        workspaceName,
        this.root,
        undefined,
        (savedTarget) => this.refreshGitStatus(savedTarget)
      );
      this.root.debugStore?.bindDocument(document);
      this.documents.set(id, document);
    }
    document.configureOpen(intent, resolveInitialFileView(intent));
    this.show(id);
    if (intent.origin === "link" && intent.markdownAnchor !== undefined && document.canPreviewMarkdown) {
      document.navigateToHeading(intent.markdownAnchor);
    }
    if (position !== undefined) document.navigateTo(position);
    if (document.snapshot === null && document.imageSnapshot === null) await document.reload();
  }

  /** Adds an immutable generated/debugger source without a filesystem target. */
  openVirtual(
    id: string,
    name: string,
    content: string,
    language?: string,
    position?: DocumentPosition
  ): FileDocument {
    const key = `virtual:${id}`;
    let document = this.documents.get(key);
    if (document === undefined) {
      document = new FileDocument(key, name, null, "", this.root, language);
      document.setVirtualContent(content);
      this.documents.set(key, document);
    }
    if (position !== undefined) document.navigateTo(position);
    this.show(key);
    return document;
  }

  /** Selects a retained document without altering the selected conversation. */
  show(id: string): void {
    if (!this.documents.has(id)) return;
    this.activeId = id;
    this.isVisible = true;
  }

  /** Returns to the existing conversation with its composer still mounted. */
  showChat(): void {
    this.isVisible = false;
  }

  /** Requests save/discard/cancel before removing an edited document. */
  close(document: FileDocument): void {
    this.root.fileCloseStore.request([document], () => this.remove(document));
  }

  /** Reload requires explicit discard when the current buffer has local edits. */
  reload(document: FileDocument): void {
    this.root.fileCloseStore.request([document], () => {
      void document.reload();
    });
  }

  /** Finds open descendants only in the operation's exact source/workspace identity. */
  documentsAt(target: OpenCodexFileTarget): FileDocument[] {
    return [...this.documents.values()].filter(document => {
      const current = document.target;
      return current !== null && current.sourceId === target.sourceId && current.projectId === target.projectId &&
        current.workspaceId === target.workspaceId && current.workspacePath === target.workspacePath &&
        (current.path === target.path || current.path.startsWith(`${target.path}/`));
    });
  }

  /** Reopens renamed identities after confirmation and retains content if the subsequent read fails. */
  async completeEntryMutation(documents: FileDocument[], target: OpenCodexFileTarget, newPath: string | null): Promise<void> {
    const selectedId = this.activeId;
    const wasVisible = this.isVisible;
    let renamedSelection: string | null = null;
    for (const document of documents) {
      if (this.isDisposed) return;
      if (newPath !== null && document.target !== null) {
        const path = newPath + document.target.path.slice(target.path.length);
        const renamedTarget = { ...document.target, path };
        await this.open(renamedTarget, document.workspaceName);
        const replacement = this.documentsAt(renamedTarget).find(item => item.target?.path === path);
        if (replacement !== undefined) {
          if (replacement.snapshot === null && replacement.imageSnapshot === null) {
            runInAction(() => {
              replacement.snapshot = document.snapshot;
              replacement.imageSnapshot = document.imageSnapshot;
              replacement.content = document.savedContent;
              replacement.savedContent = document.savedContent;
            });
          }
          replacement.setImageZoom(document.imageZoom);
          replacement.setLanguageOverride(document.languageOverride);
          replacement.setMarkdownPreview(document.markdownPreview);
          runInAction(() => {
            replacement.previewScrollTop = document.previewScrollTop;
            replacement.viewState = document.viewState;
          });
          if (document.id === selectedId) renamedSelection = replacement.id;
        }
      }
      runInAction(() => { this.remove(document); });
    }
    runInAction(() => {
      if (renamedSelection !== null) this.activeId = renamedSelection;
      else if (selectedId !== null && this.documents.has(selectedId)) this.activeId = selectedId;
      this.isVisible = wasVisible && this.activeId !== null;
    });
  }

  /** Releases documents and invalidates all pending explorer requests. */
  dispose(): void {
    this.isDisposed = true;
    for (const document of this.documents.values()) document.dispose();
    for (const tree of this.trees.values()) tree.dispose();
    this.documents.clear();
    this.trees.clear();
  }

  /** Removes only the confirmed document, retaining the other buffers. */
  private remove(document: FileDocument): void {
    document.dispose();
    this.documents.delete(document.id);
    if (this.activeId === document.id) {
      this.activeId = Array.from(this.documents.keys()).at(-1) ?? null;
      if (this.activeId === null) this.isVisible = false;
    }
  }

  /** Refreshes status for the saved document's captured workspace. */
  refreshGitStatus(target: Readonly<OpenCodexFileTarget>): void {
    const gitStore = this.project.getGitStoreForWorkspace({
      path: target.workspacePath,
      sourceId: target.sourceId,
      workspaceId: target.workspaceId
    });
    void gitStore.statusStore.refresh();
  }
}
