import Fuse from "fuse.js";
import { makeAutoObservable } from "mobx";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";

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

  setSearchTerm(value: string): void {
    this.searchTerm = value;
  }

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

  setThreads(threads: OpenCodexThread[]): void {
    this.threads = threads.map((thread) => this.mergeThreadMetadata(thread));

    for (const thread of this.threads) {
      const chat = this.projectStore.chatsById.get(thread.id);

      if (chat !== undefined) {
        chat.setThread(thread);
      }
    }
  }

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

  findThread(threadId: string): OpenCodexThread | null {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
  }

  renameThread(threadId: string, name: string): void {
    this.threads = this.threads.map((thread) => (
      thread.id === threadId ? { ...thread, customTitle: name, title: name } : thread
    ));
  }

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
