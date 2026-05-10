/**
 * Holds the observable UI state for one opened project tab.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "./ChatStore";
import type { ProjectTrustRequest } from "./ProjectTrustStore";
import type { RootStore } from "./RootStore";
import { ThreadListStore } from "./ThreadListStore";

/**
 * Stores project-specific chat metadata and loaded chat stores.
 */
export class ProjectStore {
  project: OpenCodexProject;
  selectedChatId: string | null = null;
  trustRequest: ProjectTrustRequest | null = null;
  readonly threadListStore: ThreadListStore;
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

  get threads(): OpenCodexThread[] {
    return this.threadListStore.threads;
  }

  set threads(threads: OpenCodexThread[]) {
    this.threadListStore.threads = threads;
  }

  get searchTerm(): string {
    return this.threadListStore.searchTerm;
  }

  set searchTerm(value: string) {
    this.threadListStore.searchTerm = value;
  }

  get isLoadingThreads(): boolean {
    return this.threadListStore.isLoadingThreads;
  }

  set isLoadingThreads(value: boolean) {
    this.threadListStore.isLoadingThreads = value;
  }

  get isCreatingThread(): boolean {
    return this.threadListStore.isCreatingThread;
  }

  set isCreatingThread(value: boolean) {
    this.threadListStore.isCreatingThread = value;
  }

  get loadingThreadId(): string | null {
    return this.threadListStore.loadingThreadId;
  }

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
   * Updates project metadata after it is refreshed by the backend.
   *
   * @param project Project metadata to apply.
   *
   * @returns Nothing.
   */
  setProject(project: OpenCodexProject): void {
    this.project = project;
  }

  setTrustRequest(request: ProjectTrustRequest): void {
    this.trustRequest = request;
  }

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
}
