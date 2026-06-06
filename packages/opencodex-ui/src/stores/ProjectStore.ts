/**
 * Holds the observable UI state for one opened project tab.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "./ChatStore";
import { ProjectCommandsStore } from "./ProjectCommandsStore";
import { ProjectContextStore } from "./ProjectContextStore";
import { ProjectGitStore } from "./ProjectGitStore";
import type { ProjectTrustRequest } from "./ProjectTrustStore";
import type { RootStore } from "./RootStore";
import { ThreadListStore } from "./ThreadListStore";

export type ThreadIndicatorState = "idle" | "running" | "unseen";

/**
 * Stores project-specific chat metadata and loaded chat stores.
 */
export class ProjectStore {
  project: OpenCodexProject;
  selectedChatId: string | null = null;
  trustRequest: ProjectTrustRequest | null = null;
  readonly threadListStore: ThreadListStore;
  readonly gitStore: ProjectGitStore;
  readonly commandsStore: ProjectCommandsStore;
  readonly contextStore: ProjectContextStore;
  readonly chatsById = new Map<string, ChatStore>();

  /**
   * Creates a store for one opened project.
   *
   * @param project Project metadata.
   */
  constructor(
    project: OpenCodexProject,
    private readonly root: RootStore
  ) {
    this.project = project;
    this.threadListStore = new ThreadListStore(this, root);
    this.gitStore = new ProjectGitStore(this, root);
    this.commandsStore = new ProjectCommandsStore(this, root);
    this.contextStore = new ProjectContextStore(this, root);
    makeAutoObservable<ProjectStore, "root">(this, { root: false });
  }

  /**
   * Returns the project path used by Codex as the working directory.
   *
   * @returns Project path.
   */
  get projectPath(): string {
    return this.project.path;
  }

  /**
   * Returns whether the project is no longer associated with a Codex source.
   *
   * @returns `true` when the project is read-only.
   */
  get isOrphan(): boolean {
    return this.project.sourceId === null;
  }

  get isCodexSourceReady(): boolean {
    return this.root.sourcesStore.isSourceReady(this.project.sourceId);
  }

  get isCodexSourceUnavailable(): boolean {
    return this.project.sourceId !== null && !this.isCodexSourceReady;
  }

  get isReadOnlyFromCache(): boolean {
    return this.isOrphan || this.isCodexSourceUnavailable;
  }

  /**
   * Resolves the Codex source that owns one thread.
   *
   * @param thread Thread metadata.
   *
   * @returns Thread source, or the project source fallback.
   */
  resolveThreadSourceId(thread: OpenCodexThread): string | null {
    return thread.sourceId ?? this.project.sourceId;
  }

  /**
   * Repairs thread metadata with the project source when Codex omitted it.
   *
   * @param thread Thread metadata.
   *
   * @returns Thread metadata with a resolved source when available.
   */
  ensureThreadSource(thread: OpenCodexThread): OpenCodexThread {
    const sourceId = this.resolveThreadSourceId(thread);

    if (sourceId === thread.sourceId) {
      return thread;
    }

    return {
      ...thread,
      sourceId
    };
  }

  /**
   * Returns the display name shown in tabs and lists.
   *
   * @returns Project display name.
   */
  get displayName(): string {
    return this.project.displayName ?? this.project.defaultName;
  }

  /**
   * Returns the selected chat store when one is open.
   *
   * @returns Selected chat store, or `null`.
   */
  get selectedChat(): ChatStore | null {
    if (this.selectedChatId === null) {
      return null;
    }

    return this.chatsById.get(this.selectedChatId) ?? null;
  }

  /**
   * Returns the thread metadata shown in the project sidebar.
   *
   * @returns Thread collection.
   */
  get threads(): OpenCodexThread[] {
    return this.threadListStore.threads;
  }

  /**
   * Replaces the thread metadata shown in the project sidebar.
   *
   * @param threads Thread collection.
   */
  set threads(threads: OpenCodexThread[]) {
    this.threadListStore.threads = threads;
  }

  /**
   * Returns the project thread search term.
   *
   * @returns Search text.
   */
  get searchTerm(): string {
    return this.threadListStore.searchTerm;
  }

  /**
   * Updates the project thread search term.
   *
   * @param value Search text.
   */
  set searchTerm(value: string) {
    this.threadListStore.searchTerm = value;
  }

  /**
   * Returns whether this project's thread list is loading.
   *
   * @returns Loading flag.
   */
  get isLoadingThreads(): boolean {
    return this.threadListStore.isLoadingThreads;
  }

  /**
   * Updates whether this project's thread list is loading.
   *
   * @param value Loading flag.
   */
  set isLoadingThreads(value: boolean) {
    this.threadListStore.isLoadingThreads = value;
  }

  /**
   * Returns whether a new thread is being created for this project.
   *
   * @returns Creation flag.
   */
  get isCreatingThread(): boolean {
    return this.threadListStore.isCreatingThread;
  }

  /**
   * Updates whether a new thread is being created for this project.
   *
   * @param value Creation flag.
   */
  set isCreatingThread(value: boolean) {
    this.threadListStore.isCreatingThread = value;
  }

  /**
   * Returns the thread currently loading for this project.
   *
   * @returns Loading thread identifier, or `null`.
   */
  get loadingThreadId(): string | null {
    return this.threadListStore.loadingThreadId;
  }

  /**
   * Updates the thread currently loading for this project.
   *
   * @param value Loading thread identifier, or `null`.
   */
  set loadingThreadId(value: string | null) {
    this.threadListStore.loadingThreadId = value;
  }

  /**
   * Returns the threads matching the current project search term.
   *
   * @returns Filtered thread list.
   */
  get filteredThreads(): OpenCodexThread[] {
    return this.threadListStore.filteredThreads;
  }

  /**
   * Returns whether one chat in this project is currently running.
   *
   * @returns `true` when at least one loaded chat is active.
   */
  get hasRunningChatIndicator(): boolean {
    return Array.from(this.chatsById.values()).some((chatStore) => (
      chatStore.hasRunningTurnIndicator
    ));
  }

  /**
   * Returns whether one chat in this project has unseen completed work.
   *
   * @returns `true` when at least one loaded chat should be highlighted.
   */
  get hasUnseenChatIndicator(): boolean {
    return Array.from(this.chatsById.values()).some((chatStore) => (
      chatStore.hasUnseenTurnIndicator
    ));
  }

  /**
   * Returns whether one loaded chat is synchronizing with Codex.
   *
   * @returns `true` when at least one chat sync is active.
   */
  get hasSyncingChat(): boolean {
    return Array.from(this.chatsById.values()).some((chatStore) => chatStore.isSyncing);
  }

  /**
   * Returns the aggregated work indicator for this project.
   *
   * @returns Project indicator state.
   */
  get indicatorState(): ThreadIndicatorState {
    if (this.hasRunningChatIndicator) {
      return "running";
    }

    if (this.hasUnseenChatIndicator) {
      return "unseen";
    }

    return "idle";
  }

  /**
   * Updates project metadata after it is refreshed by the backend.
   *
   * @param project Project metadata to apply.
   *
   * @returns Nothing.
   */
  setProject(project: OpenCodexProject): void {
    this.project = project;
    this.gitStore.applyProjectPreferences(project.preferences);
    this.repairStoredThreadSources();
  }

  /**
   * Stores a trust request owned by this project.
   *
   * @param request Trust request to show.
   *
   * @returns Nothing.
   */
  setTrustRequest(request: ProjectTrustRequest): void {
    this.trustRequest = request;
  }

  /**
   * Clears the trust request when it matches the provided path.
   *
   * @param projectPath Project path that completed trust handling.
   *
   * @returns Nothing.
   */
  clearTrustRequest(projectPath: string): void {
    if (this.trustRequest?.projectPath === projectPath) {
      this.trustRequest = null;
    }
  }

  /**
   * Replaces the visible thread list with fresh metadata.
   *
   * @param threads Thread collection to show for the project.
   *
   * @returns Nothing.
   */
  setThreads(threads: OpenCodexThread[]): void {
    this.threadListStore.setThreads(threads);
  }

  /**
   * Inserts or updates one thread in the project list.
   *
   * @param thread Thread metadata to insert.
   *
   * @returns Merged thread metadata.
   */
  upsertThread(thread: OpenCodexThread): OpenCodexThread {
    return this.threadListStore.upsertThread(thread);
  }

  /**
   * Finds one thread in the project list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching thread, or `null`.
   */
  findThread(threadId: string): OpenCodexThread | null {
    return this.threadListStore.findThread(threadId);
  }

  /**
   * Returns an existing chat store or creates a new one from thread metadata.
   *
   * @param thread Thread metadata used by the chat.
   *
   * @returns Chat store for the thread.
   */
  getOrCreateChat(thread: OpenCodexThread): ChatStore {
    const existingChat = this.chatsById.get(thread.id);

    if (existingChat !== undefined) {
      existingChat.setThread(thread);
      return existingChat;
    }

    const createdChat = new ChatStore(thread, this, this.root);
    this.chatsById.set(thread.id, createdChat);
    return createdChat;
  }

  /**
   * Selects a chat by identifier.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  selectChat(threadId: string): void {
    this.selectedChatId = threadId;
    this.markThreadSeen(threadId);
  }

  /**
   * Marks the selected chat as seen when it is loaded.
   *
   * @returns Nothing.
   */
  markSelectedChatSeen(): void {
    if (this.selectedChatId === null) {
      return;
    }

    this.markThreadSeen(this.selectedChatId);
  }

  /**
   * Marks one chat as seen when it is loaded.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  markThreadSeen(threadId: string): void {
    this.chatsById.get(threadId)?.markSeen();
  }

  /**
   * Returns the work indicator state for one thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Thread indicator state.
   */
  getThreadIndicatorState(threadId: string): ThreadIndicatorState {
    const chatStore = this.chatsById.get(threadId);

    if (chatStore === undefined) {
      return "idle";
    }

    if (chatStore.hasRunningTurnIndicator) {
      return "running";
    }

    if (chatStore.hasUnseenTurnIndicator) {
      return "unseen";
    }

    return "idle";
  }

  /**
   * Sets the project search term.
   *
   * @param value Search text.
   *
   * @returns Nothing.
   */
  setSearchTerm(value: string): void {
    this.threadListStore.setSearchTerm(value);
  }

  /**
   * Refreshes this project's thread list.
   *
   * @param sourceIdOverride Optional source override used after project opening.
   *
   * @returns Nothing.
   */
  refreshThreads(sourceIdOverride?: string | null): void {
    this.threadListStore.refresh(sourceIdOverride);
  }

  /**
   * Creates a new thread in this project.
   *
   * @returns Nothing.
   */
  createThread(): void {
    this.threadListStore.createThread();
  }

  /**
   * Opens a thread in this project.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  openThread(threadId: string): void {
    this.threadListStore.openThread(threadId);
  }

  /**
   * Applies a local thread rename.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   *
   * @returns Nothing.
   */
  renameThread(threadId: string, name: string): void {
    this.threadListStore.renameThread(threadId, name);
  }

  /**
   * Clears loaded chat stores before the project tab is closed.
   *
   * @returns Nothing.
   */
  clearMemory(): void {
    this.chatsById.clear();
    this.threadListStore.clear();
    this.selectedChatId = null;
  }

  private repairStoredThreadSources(): void {
    if (this.project.sourceId === null) {
      return;
    }

    const repairedThreads = this.threadListStore.threads.map((thread) => (
      this.ensureThreadSource(thread)
    ));
    const hasRepairedThread = repairedThreads.some((thread, index) => (
      thread !== this.threadListStore.threads[index]
    ));

    if (hasRepairedThread) {
      this.threadListStore.threads = repairedThreads;
    }

    for (const chatStore of this.chatsById.values()) {
      if (chatStore.thread.sourceId === null) {
        chatStore.setThread(chatStore.thread);
      }
    }
  }
}
