import { makeAutoObservable, runInAction } from "mobx";
import type {
  OpenCodexProjectWorkspace, OpenCodexWorkspaceCreation, OpenCodexWorkspaceDiscoveryResult,
  OpenCodexWorkspaceStart, OpenCodexWorkspaceRoot
} from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "./ProjectStore";

/** Source-owned catalogue and explicit workspace operations for one logical project. */
export class ProjectWorkspacesStore {
  /** Retained catalogue, including unavailable historical entries. */
  workspaces: OpenCodexProjectWorkspace[] = [];
  /** Durable creations that need an explicit recovery attempt. */
  pending: OpenCodexWorkspaceCreation[] = [];
  /** Workspace used when composing a new conversation. */
  selectedId: string | null = null;
  /** Serializes user mutations without hiding uncertain backend outcomes. */
  isBusy = false;
  /** Last failure, retained until the next explicit action. */
  error: string | null = null;
  /** Discovery exclusions shown with their original paths. */
  skipped: OpenCodexWorkspaceDiscoveryResult["skipped"] = [];
  /** Discards stale catalogue reads after a later request or disposal. */
  private generation = 0;

  /** Keeps transport and project references outside observable state. */
  constructor(private readonly project: ProjectStore, private readonly root: RootStore) {
    makeAutoObservable<ProjectWorkspacesStore, "project" | "root">(
      this, { project: false, root: false }, { autoBind: true });
  }

  /** Uses the conversation's physical context when a conversation is selected. */
  get current(): OpenCodexProjectWorkspace | null {
    const thread = this.project.selectedChat?.thread;
    if (thread !== undefined) {
      return this.workspaces.find((item) => item.path === thread.projectPath) ?? null;
    }
    return this.workspaces.find((item) => item.id === this.selectedId)
      ?? this.workspaces.find((item) => item.isPrimary) ?? null;
  }

  /** Lists only locations belonging to this project's filesystem source. */
  get storageRoots(): OpenCodexWorkspaceRoot[] {
    return (this.root.appStore.settingsStore.settings.workspaceRoots ?? [])
      .filter((item) => item.sourceId === this.project.project.sourceId);
  }

  /** Exposes the final directory layout without generating a second, temporary workspace identity. */
  storagePreview(rootId: string): string {
    const root = this.storageRoots.find((item) => item.id === rootId);
    if (root === undefined) return "";
    const separator = root.path.startsWith("/") ? "/" : "\\";
    return [root.path.replace(/[\\/]+$/u, ""), this.project.project.id, "<workspace-id>"].join(separator);
  }

  /** Reloads persisted state even when the source is offline. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    try {
      const [workspaces, pending] = await Promise.all([
        this.root.request<OpenCodexProjectWorkspace[]>({
          type: "projectWorkspaces.list", projectId: this.project.project.id
        }),
        this.root.request<OpenCodexWorkspaceCreation[]>({
          type: "projectWorkspaces.creations.list", projectId: this.project.project.id
        })
      ]);
      runInAction(() => {
        if (generation !== this.generation) return;
        this.workspaces = workspaces;
        this.pending = pending;
      });
    } catch (error) {
      runInAction(() => {
        if (generation === this.generation) this.error = errorMessage(error);
      });
    }
  }

  /** Discovers source-local checkouts without importing another project's ownership. */
  async discover(): Promise<void> {
    await this.perform(async () => {
      const result = await this.root.request<OpenCodexWorkspaceDiscoveryResult>({
        type: "projectWorkspaces.discover", projectId: this.project.project.id,
        sourceId: this.requireSource()
      });
      runInAction(() => { this.skipped = result.skipped; });
    });
  }

  /** Sends a plain creation intent; Git and source validation remain in the backend. */
  async create(destinationPath: string | undefined, start: OpenCodexWorkspaceStart, name?: string, rootId?: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.create", input: {
        projectId: this.project.project.id, sourceId: this.requireSource(), destinationPath,
        name, rootId, start: { ...start }
      } });
    });
  }

  /** Saves the secondary name through a project-scoped metadata operation. */
  async rename(workspaceId: string, name: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.rename",
        projectId: this.project.project.id, workspaceId, name });
    });
  }

  /** Selects a draft context or requests a verified transition for the selected conversation. */
  async select(workspaceId: string, threadId = this.project.selectedChatId): Promise<void> {
    await this.perform(async () => {
      if (threadId !== null) {
        await this.root.request({ type: "threads.workspace.select", threadId, workspaceId });
        const workspace = this.workspaces.find((item) => item.id === workspaceId);
        const thread = this.project.chatsById.get(threadId)?.thread
          ?? this.project.threadListStore.findThread(threadId);
        if (workspace !== undefined && thread !== null) {
          runInAction(() => this.project.upsertThread({ ...thread, projectPath: workspace.path }));
        }
      } else {
        runInAction(() => { this.selectedId = workspaceId; });
      }
    });
  }

  /** Retries verification only; the backend never blindly repeats an uncertain Git creation. */
  async recoverCreation(creationId: string): Promise<void> {
    await this.perform(async () => {
      await this.root.request({ type: "projectWorkspaces.creations.reconcile", creationId });
    });
  }

  /** Exposes explicit recovery for a conversation whose transition response was lost. */
  async recoverThread(threadId = this.project.selectedChatId): Promise<void> {
    if (threadId === null) return;
    await this.perform(async () => {
      await this.root.request({ type: "threads.workspace.reconcile", threadId });
      this.project.openThread(threadId);
    });
  }

  /** Invalidates responses when the project tab closes. */
  dispose(): void { this.generation += 1; }

  /** Runs one user operation and always refreshes its durable outcome. */
  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.isBusy || this.project.isReadOnlyFromCache) return;
    this.isBusy = true;
    this.error = null;
    try {
      await action();
    } catch (error) {
      runInAction(() => { this.error = errorMessage(error); });
    } finally {
      await this.load();
      runInAction(() => { this.isBusy = false; });
    }
  }

  /** Refuses operations against an orphan project. */
  private requireSource(): string {
    const sourceId = this.project.project.sourceId;
    if (sourceId === null) throw new Error("Workspace requires a Codex source.");
    return sourceId;
  }
}

/** Preserves actionable errors returned by the source. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
