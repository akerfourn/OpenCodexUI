/**
 * Holds the observable UI state for one chat loaded in memory.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

/**
 * Stores the loaded turns and runtime flags for a single chat.
 */
export class ChatStore {
  thread: OpenCodexThread;
  turns: OpenCodexTurn[] = [];
  activity: string[] = [];
  hasMoreOlderMessages = false;
  isLoadingOlderMessages = false;
  isSyncing = false;
  isRefreshing = false;
  isRecovering = false;
  isWorking = false;
  isStartingTurn = false;
  activeTurnId: string | null = null;
  pendingTurnId: string | null = null;
  olderMessagesPrependVersion = 0;
  scrollToBottomVersion = 0;

  /**
   * Creates a chat store for the provided thread.
   *
   * @param thread Thread metadata used by the chat.
   */
  constructor(thread: OpenCodexThread) {
    this.thread = thread;
    makeAutoObservable(this);
  }

  /**
   * Updates the chat metadata while preserving loaded turns.
   *
   * @param thread Thread metadata to apply.
   *
   * @returns Nothing.
   */
  setThread(thread: OpenCodexThread): void {
    this.thread = thread;
  }

  /**
   * Resets the transient chat state before loading a different snapshot.
   *
   * @returns Nothing.
   */
  clearLoadedState(): void {
    this.turns = [];
    this.activity = [];
    this.pendingTurnId = null;
    this.hasMoreOlderMessages = false;
    this.isLoadingOlderMessages = false;
    this.isSyncing = false;
    this.isRefreshing = false;
    this.isRecovering = false;
  }
}
