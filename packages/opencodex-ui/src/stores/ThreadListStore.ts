import Fuse from "fuse.js";
import { makeAutoObservable } from "mobx";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";

/**
 * Stores the thread list state for a single opened project.
 */
export class ThreadListStore {
  threads: OpenCodexThread[] = [];
  searchTerm = "";
  isLoadingThreads = false;
  isCreatingThread = false;
  loadingThreadId: string | null = null;

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ThreadListStore, "projectStore" | "root">(this, {
      projectStore: false,
      root: false
    });
  }

  /**
   * Returns threads matching the current search term.
   *
   * @returns Filtered thread collection.
   */
  get filteredThreads(): OpenCodexThread[] {
    const searchTerm = this.searchTerm.trim();

    if (searchTerm.length === 0) {
      return this.threads;
    }

    const fuse = new Fuse(this.threads, {
      ignoreLocation: true,
      keys: ["title", "preview", "projectName", "projectPath"],
      threshold: 0.35
    });
    const matchingThreadIds = new Set(
      fuse.search(searchTerm).map((result) => result.item.id)
    );

    return this.threads.filter((thread) => matchingThreadIds.has(thread.id));
  }

  /**
   * Updates the current thread search term.
   *
   * @param value Search text.
   *
   * @returns Nothing.
   */
  setSearchTerm(value: string): void {
    this.searchTerm = value;
  }

  /**
   * Requests a refreshed thread list for this project.
   *
   * @param sourceIdOverride Optional source override used during project opening.
   *
   * @returns Nothing.
   */
  refresh(sourceIdOverride?: string | null): void {
    const sourceId = sourceIdOverride ?? this.projectStore.project.sourceId;

    if (sourceId === null) {
      return;
    }

    this.isLoadingThreads = true;
    void this.root.request({
      type: "threads.list",
      scope: "currentProject",
      projectPath: this.projectStore.projectPath,
      sourceId,
      searchTerm: this.searchTerm
    });
  }

  /**
   * Creates a new thread in this project.
   *
   * @returns Nothing.
   */
  createThread(): void {
    if (this.projectStore.isOrphan) {
      return;
    }

    this.isCreatingThread = true;
    this.loadingThreadId = null;
    this.projectStore.selectedChatId = null;
    void this.root.request({
      type: "threads.create",
      projectPath: this.projectStore.projectPath,
      sourceId: this.projectStore.project.sourceId
    });
  }

  /**
   * Opens a thread and prepares its chat store for loading.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  openThread(threadId: string): void {
    if (this.loadingThreadId === threadId) {
      return;
    }

    this.root.startThreadSelectionTiming(threadId);

    const thread = this.findThread(threadId);
    const chatStore = thread === null ? null : this.projectStore.getOrCreateChat(thread);
    const isChangingThread = this.projectStore.selectedChatId !== threadId;
    this.root.appStore.errorMessage = null;
    this.projectStore.selectChat(threadId);
    this.root.projectsStore.rememberPendingThreadProject(threadId, this.projectStore.project.id);

    if (isChangingThread) {
      this.loadingThreadId = threadId;

      if (chatStore !== null) {
        chatStore.clearLoadedState();
      }
    } else if (chatStore !== null) {
      chatStore.isSyncing = true;
    }

    void this.root.request({ type: "threads.open", threadId });
  }

  /**
   * Replaces thread metadata while preserving local titles when needed.
   *
   * @param threads Thread metadata collection.
   *
   * @returns Nothing.
   */
  setThreads(threads: OpenCodexThread[]): void {
    this.threads = threads.map((thread) => this.mergeThreadMetadata(thread));

    for (const thread of this.threads) {
      const chat = this.projectStore.chatsById.get(thread.id);

      if (chat !== undefined) {
        chat.setThread(thread);
      }
    }
  }

  /**
   * Inserts or updates a single thread.
   *
   * @param thread Thread metadata.
   *
   * @returns Merged thread metadata.
   */
  upsertThread(thread: OpenCodexThread): OpenCodexThread {
    const mergedThread = this.mergeThreadMetadata(thread);
    const existingThread = this.findThread(thread.id);

    if (existingThread === null) {
      this.threads = [mergedThread, ...this.threads];
    } else {
      this.threads = this.threads.map((entry) => (
        entry.id === mergedThread.id ? mergedThread : entry
      ));
    }

    const chat = this.projectStore.chatsById.get(mergedThread.id);

    if (chat !== undefined) {
      chat.setThread(mergedThread);
    }

    return mergedThread;
  }

  /**
   * Finds a thread in this list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching thread, or `null`.
   */
  findThread(threadId: string): OpenCodexThread | null {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
  }

  /**
   * Applies a local thread title change.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   *
   * @returns Nothing.
   */
  renameThread(threadId: string, name: string): void {
    this.threads = this.threads.map((thread) => (
      thread.id === threadId ? { ...thread, customTitle: name, title: name } : thread
    ));
  }

  /**
   * Clears thread list state when the project tab closes.
   *
   * @returns Nothing.
   */
  clear(): void {
    this.threads = [];
    this.searchTerm = "";
    this.isLoadingThreads = false;
    this.isCreatingThread = false;
    this.loadingThreadId = null;
  }

  private mergeThreadMetadata(thread: OpenCodexThread): OpenCodexThread {
    const existingThread = this.findThread(thread.id)
      ?? this.projectStore.chatsById.get(thread.id)?.thread
      ?? null;

    if (existingThread === null) {
      return thread;
    }

    if (thread.customTitle !== null && thread.customTitle.trim().length > 0) {
      return thread;
    }

    return {
      ...thread,
      customTitle: existingThread.customTitle,
      title: resolveThreadTitle(thread.codexTitle, existingThread.customTitle, thread.preview)
    };
  }
}

function resolveThreadTitle(
  codexTitle: string,
  customTitle: string | null,
  preview: string
): string {
  const trimmedCustomTitle = customTitle?.trim() ?? "";
  const trimmedCodexTitle = codexTitle.trim();

  if (trimmedCustomTitle.length > 0) {
    return trimmedCustomTitle;
  }

  if (trimmedCodexTitle.length > 0) {
    return trimmedCodexTitle;
  }

  return preview;
}
