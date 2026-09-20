import { makeAutoObservable, observable } from "mobx";
import type { OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "../project/ProjectStore";
import { FileDocument, type DocumentPosition } from "./FileDocument";
import { WorkspaceTreeStore } from "./WorkspaceTreeStore";

/** Project document catalogue independent of the right tool and viewer lifetime. */
export class ProjectFilesStore {
  /** Retained document instances keyed by their complete source identity. */
  readonly documents = observable.map<string, FileDocument>({}, { deep: false });
  /** Explorer instances retain expansion and isolate asynchronous results. */
  private readonly trees = new Map<string, WorkspaceTreeStore>();
  /** Last selected file, even while the chat is displayed. */
  activeId: string | null = null;
  /** Central content choice is independent of the selected project tool. */
  isVisible = false;

  /** Binds document requests and close protection to this project. */
  constructor(
    private readonly project: ProjectStore,
    private readonly root: RootStore
  ) {
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

  /** Opens one source document; future tools can supply a source position. */
  async open(target: OpenCodexFileTarget, workspaceName: string, position?: DocumentPosition): Promise<void> {
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
        this.root
      );
      this.documents.set(id, document);
    }
    this.show(id);
    if (position !== undefined) document.position = { ...position };
    if (document.snapshot === null) await document.reload();
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
    if (position !== undefined) document.position = { ...position };
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

  /** Releases documents and invalidates all pending explorer requests. */
  dispose(): void {
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
}
