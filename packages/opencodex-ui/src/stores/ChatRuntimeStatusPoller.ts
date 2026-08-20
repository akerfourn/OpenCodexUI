/** Polls Codex runtime status to recover from missed turn-completed events. */
import { runInAction } from "mobx";

import type { OpenCodexThreadRuntimeStatus } from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";

const THREAD_RUNTIME_STATUS_POLL_INTERVAL_MS = 30_000;

/**
 * Owns the runtime-status timer for one chat without owning chat state.
 */
export class ChatRuntimeStatusPoller {
  /** Chat store whose current runtime context is read dynamically. */
  private readonly chatStore: ChatStore;
  /** Poll timer used to recover from missed turn-completed notifications. */
  private runtimeStatusPollId: ReturnType<typeof setInterval> | null = null;
  /** Whether a runtime status request is currently in flight. */
  private isReadingRuntimeStatus = false;

  /**
   * Creates a runtime-status poller for a chat.
   *
   * @param chatStore Chat store providing the current runtime context and
   * applying status responses.
   */
  constructor(chatStore: ChatStore) {
    this.chatStore = chatStore;
  }

  /** Starts polling runtime status when no timer is already active. */
  start(): void {
    if (this.runtimeStatusPollId !== null) {
      return;
    }

    this.runtimeStatusPollId = setInterval(() => {
      void this.reconcileRuntimeStatus();
    }, THREAD_RUNTIME_STATUS_POLL_INTERVAL_MS);
  }

  /** Stops polling and clears the in-flight request guard. */
  stop(): void {
    if (this.runtimeStatusPollId !== null) {
      clearInterval(this.runtimeStatusPollId);
      this.runtimeStatusPollId = null;
    }

    this.isReadingRuntimeStatus = false;
  }

  /** Releases the timer and transient request state owned by this poller. */
  dispose(): void {
    this.stop();
  }

  /** Reads runtime status and forwards a response to the owning chat store. */
  private async reconcileRuntimeStatus(): Promise<void> {
    if (!this.shouldReadRuntimeStatus()) {
      return;
    }

    this.isReadingRuntimeStatus = true;

    try {
      const status = await this.chatStore.readRuntimeStatus();

      runInAction(() => {
        this.applyRuntimeStatus(status);
      });
    } catch {
      runInAction(() => {
        this.isReadingRuntimeStatus = false;
      });
    }
  }

  /** Checks whether the current chat context permits a status request. */
  private shouldReadRuntimeStatus(): boolean {
    return (
      this.chatStore.runtime.isWorking &&
      this.chatStore.runtime.activeTurnId !== null &&
      !this.isReadingRuntimeStatus &&
      !this.chatStore.isReadOnlyFromCache
    );
  }

  /** Forwards a completed status read to the owning chat store. */
  private applyRuntimeStatus(status: OpenCodexThreadRuntimeStatus): void {
    this.isReadingRuntimeStatus = false;
    this.chatStore.applyRuntimeStatus(status);
  }
}
