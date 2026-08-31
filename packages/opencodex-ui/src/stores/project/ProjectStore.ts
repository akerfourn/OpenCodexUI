/**
 * Holds the observable UI state for one opened project tab.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../chat/ChatStore";
import { ProjectCommandsStore } from "./ProjectCommandsStore";
import { ProjectComposeStore } from "./ProjectComposeStore";
import { ProjectContextStore } from "./ProjectContextStore";
import { ProjectGitStore } from "./git/ProjectGitStore";
import { ProjectRulesStore } from "./ProjectRulesStore";
import { ProjectTasksStore } from "./ProjectTasksStore";
import { ProjectViewLayoutStore } from "./ProjectViewLayoutStore";
import type { ProjectTrustRequest } from "./ProjectTrustStore";
import type { RootStore } from "../RootStore";
import { ThreadListStore } from "./threads/ThreadListStore";

export type ThreadIndicatorState = "idle" | "running" | "unseen";

/**
 * Stores project-specific chat metadata and loaded chat stores.
 */
export class ProjectStore {
  project: OpenCodexProject;
  selectedChatId: string | null = null;
  trustRequest: ProjectTrustRequest | null = null;
  /** Resizable layout state retained outside mounted React views. */
  readonly layoutStore: ProjectViewLayoutStore;
  readonly threadListStore: ThreadListStore;
  readonly gitStore: ProjectGitStore;
  readonly commandsStore: ProjectCommandsStore;
  readonly composeStore: ProjectComposeStore;
  readonly contextStore: ProjectContextStore;
  readonly rulesStore: ProjectRulesStore;
  readonly tasksStore: ProjectTasksStore;
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
    this.layoutStore = new ProjectViewLayoutStore();
    this.threadListStore = new ThreadListStore(this, root);
    this.gitStore = new ProjectGitStore(this, root);
    this.commandsStore = new ProjectCommandsStore(this, root);
    this.composeStore = new ProjectComposeStore(this, root);
    this.contextStore = new ProjectContextStore(this, root);
    this.rulesStore = new ProjectRulesStore(this, root);
    this.tasksStore = new ProjectTasksStore(this, root);
    makeAutoObservable<ProjectStore, "root" | "layoutStore">(this, {
      root: false,
      layoutStore: false
    });
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
   * Opens a link through the root transport.
   *
   * @param href Link target.
   *
   * @returns Nothing.
   */
  openExternalLink(href: string): void {
    this.root.openExternalLink(href);
  }

  /**
   * Opens a related collaboration thread without losing its source route.
   *
   * @param sourceId Source that owns the related thread.
   * @param threadId Related thread identifier.
   */
  navigateToThread(sourceId: string | null, threadId: string): void {
    this.root.projectsStore.navigateToThread(sourceId, threadId);
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
   * Returns whether one chat in this project is currently running.
   *
   * @returns `true` when at least one loaded chat is active.
   */
  get hasRunningChatIndicator(): boolean {
    return Array.from(this.chatsById.values()).some((chatStore) => (
      chatStore.runtime.hasRunningTurnIndicator
    ));
  }

  /**
   * Returns whether one chat in this project has unseen completed work.
   *
   * @returns `true` when at least one loaded chat should be highlighted.
   */
  get hasUnseenChatIndicator(): boolean {
    return Array.from(this.chatsById.values()).some((chatStore) => (
      chatStore.runtime.hasUnseenTurnIndicator
    ));
  }

  /**
   * Returns whether one loaded chat is synchronizing with Codex.
   *
   * @returns `true` when at least one chat sync is active.
   */
  get hasSyncingChat(): boolean {
    return Array.from(this.chatsById.values()).some((chatStore) => chatStore.runtime.isSyncing);
  }

  /**
   * Returns whether one visible project tool needs attention.
   *
   * @returns `true` when Git, commands, or Compose should display an activity marker.
   */
  get hasSidePanelActivity(): boolean {
    const hasComposeActivity = this.composeStore.isAvailable &&
      this.composeStore.hasComposeFile &&
      this.composeStore.hasNonStoppedContainer;

    return this.gitStore.commitStore.hasDraftMessage ||
      this.commandsStore.hasActiveRun ||
      hasComposeActivity;
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
    const projectIdentityChanged = this.project.path !== project.path ||
      this.project.sourceId !== project.sourceId;
    this.project = project;
    this.gitStore.applyProjectPreferences(project.preferences);
    if (projectIdentityChanged) {
      this.composeStore.reset();
    }
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
    this.registerChatRoute(createdChat);
    return createdChat;
  }

  /**
   * Registers or refreshes the source-aware route for a loaded chat.
   *
   * @param chatStore Chat owned by this project.
   */
  registerChatRoute(chatStore: ChatStore): void {
    this.root.projectsStore.registerLoadedChat(this, chatStore);
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

    if (chatStore.runtime.hasRunningTurnIndicator) {
      return "running";
    }

    if (chatStore.runtime.hasUnseenTurnIndicator) {
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
   * Removes a deleted thread from list state and loaded chat memory.
   *
   * @param threadId Deleted thread identifier.
   *
   * @returns Nothing.
   */
  removeThread(threadId: string): void {
    const chatStore = this.chatsById.get(threadId);

    if (chatStore !== undefined) {
      this.root.projectsStore.unregisterLoadedChat(chatStore);
      chatStore.dispose();
      this.chatsById.delete(threadId);
    }

    this.threadListStore.removeThread(threadId);
  }

  /**
   * Clears loaded chat stores before the project tab is closed.
   *
   * @returns Nothing.
   */
  clearMemory(): void {
    for (const chatStore of this.chatsById.values()) {
      this.root.projectsStore.unregisterLoadedChat(chatStore);
      chatStore.dispose();
    }

    this.chatsById.clear();
    this.commandsStore.dispose();
    this.composeStore.reset();
    this.threadListStore.clear();
    this.selectedChatId = null;
  }

  /**
   * Repairs loaded thread metadata when a project source becomes known later.
   */
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
