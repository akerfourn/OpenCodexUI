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
  isShowingArchivedThreads = false;
  archivingThreadId: string | null = null;
  hasArchivedThreads = false;
  isCheckingArchivedThreads = false;

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
   * Selects whether the list shows active or archived threads.
   *
   * @param value Whether archived threads should be shown.
   *
   * @returns Nothing.
   */
  setShowingArchivedThreads(value: boolean): void {
    if (this.isShowingArchivedThreads === value) {
      return;
    }

    this.isShowingArchivedThreads = value;
    this.threads = [];
    this.refresh();
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

    if (sourceId === null || !this.root.sourcesStore.isSourceReady(sourceId)) {
      return;
    }

    this.isLoadingThreads = true;
    void this.root.request({
      type: "threads.list",
      scope: "currentProject",
      projectPath: this.projectStore.projectPath,
      sourceId,
      searchTerm: this.searchTerm,
      archived: this.isShowingArchivedThreads
    });

    if (!this.isShowingArchivedThreads) {
      this.refreshArchivedThreadPresence(sourceId);
    }
  }

  /**
   * Creates a new thread in this project.
   *
   * @returns Nothing.
   */
  createThread(): void {
    if (this.projectStore.isReadOnlyFromCache) {
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

      if (chatStore !== null && chatStore.turns.length > 0) {
        chatStore.isSyncing = true;
      } else if (chatStore !== null) {
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
   * Archives a thread and removes it from the active list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  archiveThread(threadId: string): void {
    if (this.projectStore.isReadOnlyFromCache || this.archivingThreadId !== null) {
      return;
    }

    this.archivingThreadId = threadId;
    void this.root.request({ type: "threads.archive", threadId })
      .then(() => {
        this.hasArchivedThreads = true;
        this.removeThreadFromVisibleList(threadId);
      })
      .finally(() => {
        this.archivingThreadId = null;
      });
  }

  /**
   * Restores an archived thread and removes it from the archived list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  unarchiveThread(threadId: string): void {
    if (this.projectStore.isReadOnlyFromCache || this.archivingThreadId !== null) {
      return;
    }

    this.archivingThreadId = threadId;
    void this.root.request({ type: "threads.unarchive", threadId })
      .then(() => {
        this.removeThreadFromVisibleList(threadId);
        this.hasArchivedThreads = this.threads.length > 0;
      })
      .finally(() => {
        this.archivingThreadId = null;
      });
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
    this.isShowingArchivedThreads = false;
    this.archivingThreadId = null;
    this.hasArchivedThreads = false;
    this.isCheckingArchivedThreads = false;
  }

  private refreshArchivedThreadPresence(sourceId: string): void {
    if (this.isCheckingArchivedThreads) {
      return;
    }

    this.isCheckingArchivedThreads = true;
    void this.root.request<OpenCodexThread[]>({
      type: "threads.list",
      scope: "currentProject",
      projectPath: this.projectStore.projectPath,
      sourceId,
      archived: true
    })
      .then((threads) => {
        this.hasArchivedThreads = threads.length > 0;
      })
      .finally(() => {
        this.isCheckingArchivedThreads = false;
      });
  }

  private removeThreadFromVisibleList(threadId: string): void {
    this.threads = this.threads.filter((thread) => thread.id !== threadId);

    if (this.projectStore.selectedChatId === threadId) {
      this.projectStore.selectedChatId = null;
    }
  }

  private mergeThreadMetadata(thread: OpenCodexThread): OpenCodexThread {
    const resolvedThread = this.projectStore.ensureThreadSource(thread);
    const existingThread = this.findThread(thread.id)
      ?? this.projectStore.chatsById.get(thread.id)?.thread
      ?? null;

    if (existingThread === null) {
      return resolvedThread;
    }

    if (resolvedThread.customTitle !== null && resolvedThread.customTitle.trim().length > 0) {
      return resolvedThread;
    }

    return {
      ...resolvedThread,
      customTitle: existingThread.customTitle,
      title: resolveThreadTitle(
        resolvedThread.codexTitle,
        existingThread.customTitle,
        resolvedThread.preview
      )
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
