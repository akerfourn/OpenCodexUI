/**
 * Holds the observable UI state for one opened project tab.
 */
import Fuse from "fuse.js";
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "./ChatStore";

/**
 * Stores project-specific chat metadata and loaded chat stores.
 */
export class ProjectStore {
  project: OpenCodexProject;
  threads: OpenCodexThread[] = [];
  searchTerm = "";
  selectedChatId: string | null = null;
  isLoadingThreads = false;
  isCreatingThread = false;
  loadingThreadId: string | null = null;
  readonly chatsById = new Map<string, ChatStore>();

  /**
   * Creates a store for one opened project.
   *
   * @param project Project metadata.
   */
  constructor(project: OpenCodexProject) {
    this.project = project;
    makeAutoObservable(this);
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
   * Returns the threads matching the current project search term.
   *
   * @returns Filtered thread list.
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
   * Updates project metadata after it is refreshed by the backend.
   *
   * @param project Project metadata to apply.
   *
   * @returns Nothing.
   */
  setProject(project: OpenCodexProject): void {
    this.project = project;
  }

  /**
   * Replaces the visible thread list with fresh metadata.
   *
   * @param threads Thread collection to show for the project.
   *
   * @returns Nothing.
   */
  setThreads(threads: OpenCodexThread[]): void {
    this.threads = threads.map((thread) => this.mergeThreadMetadata(thread));

    for (const thread of this.threads) {
      const chat = this.chatsById.get(thread.id);

      if (chat !== undefined) {
        chat.setThread(thread);
      }
    }
  }

  /**
   * Inserts or updates one thread in the project list.
   *
   * @param thread Thread metadata to insert.
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

    const chat = this.chatsById.get(mergedThread.id);

    if (chat !== undefined) {
      chat.setThread(mergedThread);
    }

    return mergedThread;
  }

  /**
   * Finds one thread in the project list.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching thread, or `null`.
   */
  findThread(threadId: string): OpenCodexThread | null {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
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

    const createdChat = new ChatStore(thread);
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
    this.searchTerm = value;
  }

  /**
   * Clears loaded chat stores before the project tab is closed.
   *
   * @returns Nothing.
   */
  clearMemory(): void {
    this.chatsById.clear();
    this.threads = [];
    this.selectedChatId = null;
  }

  /**
   * Merges incoming metadata with the local custom title when needed.
   *
   * @param thread Thread payload to process.
   *
   * @returns Merged metadata.
   */
  private mergeThreadMetadata(thread: OpenCodexThread): OpenCodexThread {
    const existingThread = this.findThread(thread.id) ?? this.chatsById.get(thread.id)?.thread ?? null;

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

/**
 * Resolves thread title.
 *
 * @param codexTitle Codex title.
 * @param customTitle Custom title.
 * @param preview Preview.
 *
 * @returns Computed string value.
 */
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
