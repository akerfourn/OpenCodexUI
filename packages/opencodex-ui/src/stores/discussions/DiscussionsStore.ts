import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexDiscussion, OpenCodexProject, OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import { ProjectStore } from "../project/ProjectStore";
import type { RootStore } from "../RootStore";

/** A single collection of personal chats, independent of Home's project list and project tabs. */
export class DiscussionsStore {
  /** Keeps selection when moving between Home, projects and discussions. */
  selectedEnvironmentId: string | null = null;
  /** Source used only for the next local draft; existing conversations retain their owner. */
  newSourceId: string | null = null;
  /** Filters the collection without changing the displayed conversation. */
  search = "";
  /** Shows archived conversations without allocating another navigation tab. */
  archived = false;
  /** Covers bounded cache refreshes; source synchronization stays with the shared runtime. */
  isLoading = false;
  /** Discards replies superseded by a newer filter or refresh. */
  private generation = 0;

  /** Reuses the existing conversation context stores for files, permissions and live events. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<DiscussionsStore, "root">(this, { root: false }, { autoBind: true });
  }

  /** Internal contexts are registered for normal event routing, never as Home projects. */
  get environments(): ProjectStore[] {
    return [...this.root.projectsStore.projectStoresById.values()]
      .filter((store) => store.project.kind === "discussion");
  }

  /** Resolves the selected source-owned context without a global backend selection. */
  get selected(): ProjectStore | null {
    return this.environments.find((store) => store.project.id === this.selectedEnvironmentId) ?? null;
  }

  /** Resolves a default only for new discussions. */
  get sourceId(): string | null {
    const choices = [this.newSourceId, this.root.appStore.settingsStore.settings.defaultSourceId,
      this.root.sourcesStore.sources[0]?.id];
    return choices.find((id) => id != null && this.root.sourcesStore.findSource(id) !== null) ?? null;
  }

  /** Sorts by latest chat activity and keeps unsent drafts visible before any RPC. */
  get entries(): { environment: ProjectStore; thread: OpenCodexThread }[] {
    const search = this.search.trim().toLocaleLowerCase();
    return this.environments.flatMap((environment) => environment.threadListStore.threads
      .filter((thread) => thread.parentThreadId === null && thread.isArchived === this.archived)
      .filter((thread) => search.length === 0 || `${thread.title} ${thread.preview}`.toLocaleLowerCase().includes(search))
      .map((thread) => ({ environment, thread })))
      .sort((left, right) => (right.thread.updatedAt ?? "").localeCompare(left.thread.updatedAt ?? ""));
  }

  /** Aggregates attention independently of the currently selected personal chat. */
  get indicatorState(): "idle" | "running" | "unseen" {
    if (this.environments.some((store) => store.hasRunningChatIndicator)) return "running";
    if (this.environments.some((store) => store.hasUnseenChatIndicator)) return "unseen";
    return "idle";
  }

  /** Refreshes cached metadata without starting all sources or checking Git. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    this.isLoading = true;
    try {
      const discussions = await this.root.request<OpenCodexDiscussion[]>({
        type: "discussions.list", archived: this.archived
      });
      runInAction(() => {
        if (generation !== this.generation) return;
        for (const store of this.environments) {
          store.threadListStore.isShowingArchivedThreads = this.archived;
          store.setThreads([]);
        }
        for (const discussion of discussions) {
          const pendingId = discussion.pendingCreation?.clientDraftId;
          const draftOwner = pendingId === undefined ? undefined
            : this.environments.find((store) => store.chatsById.get(pendingId)?.isLocalDraft === true);
          const store = this.attachEnvironment(discussion.environment, draftOwner);
          store.threadListStore.isShowingArchivedThreads = this.archived;
          store.setThreads(discussion.threads);
          if (pendingId !== undefined && !store.chatsById.has(pendingId)) {
            store.drafts.create(store.project.path, undefined, pendingId);
          }
        }
      });
    } catch (error) {
      this.root.reportError(error);
    } finally {
      runInAction(() => { if (generation === this.generation) this.isLoading = false; });
    }
  }

  /** Opens an in-memory draft; its private directory and native thread wait for the first send. */
  createDraft(): void {
    const sourceId = this.sourceId;
    if (sourceId === null || !this.root.sourcesStore.isSourceReady(sourceId)) return;
    const now = new Date().toISOString();
    const environment: OpenCodexProject = {
      id: `discussion-draft:${crypto.randomUUID()}`, kind: "discussion", sourceId,
      path: "", defaultName: "", displayName: null, isHidden: false, preferences: {},
      createdAt: now, updatedAt: now, lastSeenAt: now, editedAt: now
    };
    const store = this.attachEnvironment(environment);
    if (this.archived) this.setArchived(false);
    store.drafts.create("");
    this.selectedEnvironmentId = store.project.id;
    this.root.navigationStore.activateDiscussions();
  }

  /** Registers a persisted context, preserving a draft's composer and message history. */
  attachEnvironment(environment: OpenCodexProject, draft?: ProjectStore): ProjectStore {
    const existing = this.root.projectsStore.projectStoresById.get(environment.id);
    const store = draft ?? existing
      ?? new ProjectStore(environment, this.root);
    if (draft !== undefined && existing !== undefined && existing !== draft) existing.clearMemory();
    const previousId = store.project.id;
    if (previousId !== environment.id) {
      this.root.projectsStore.projectStoresById.delete(previousId);
      if (this.selectedEnvironmentId === previousId) this.selectedEnvironmentId = environment.id;
    }
    store.setProject(environment);
    this.root.projectsStore.projectStoresById.set(environment.id, store);
    return store;
  }

  /** A confirmed creation supersedes catalogue replies that still describe its old pending draft. */
  materializeEnvironment(environment: OpenCodexProject, draft: ProjectStore): void {
    this.generation += 1;
    this.isLoading = false;
    this.attachEnvironment(environment, draft);
  }

  /** Finishes interrupted identity allocation without sending the draft's message. */
  async recoverCreation(environment: ProjectStore): Promise<void> {
    const chat = environment.selectedChat ?? [...environment.chatsById.values()].find((item) => item.isLocalDraft);
    if (chat === undefined || chat === null || !chat.isLocalDraft || chat.composer.isSubmitting) return;
    chat.composer.isSubmitting = true;
    try {
      await environment.drafts.ensureCreated(chat);
    } catch (error) {
      this.root.reportError(error);
    } finally {
      runInAction(() => { chat.composer.isSubmitting = false; });
    }
  }

  /** Abandons setup after the row's confirmation, retaining all native history and source files. */
  async cancelCreation(environment: ProjectStore): Promise<void> {
    const chat = [...environment.chatsById.values()].find((item) => item.isLocalDraft);
    if (chat === undefined || chat.composer.isSubmitting) return;
    chat.composer.isSubmitting = true;
    try {
      await this.root.request({ type: "discussions.cancelCreation", environmentId: environment.project.id,
        sourceId: environment.project.sourceId });
      runInAction(() => {
        this.generation += 1;
        this.isLoading = false;
        environment.clearMemory();
        this.root.projectsStore.projectStoresById.delete(environment.project.id);
        if (this.selectedEnvironmentId === environment.project.id) this.selectedEnvironmentId = null;
      });
    } catch (error) {
      this.root.reportError(error);
    } finally {
      runInAction(() => { chat.composer.isSubmitting = false; });
    }
  }

  /** Opens this explicit chat and lazily loads its file context. */
  open(environment: ProjectStore, thread: OpenCodexThread): void {
    this.selectedEnvironmentId = environment.project.id;
    this.root.navigationStore.activateDiscussions();
    if (environment.chatsById.get(thread.id)?.isLocalDraft === true) {
      environment.selectChat(thread.id);
      return;
    }
    void environment.workspaces.load();
    environment.openThread(thread.id);
  }

  /** Changes only the owner of future drafts. */
  setSource(sourceId: string): void { this.newSourceId = sourceId; }

  /** Updates the local title/preview filter. */
  setSearch(search: string): void { this.search = search; }

  /** Refreshes the alternative catalogue without affecting running turns. */
  setArchived(archived: boolean): void {
    this.archived = archived;
    void this.load();
  }
}
