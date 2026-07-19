/**
 * Holds the live metadata-only Codex event trace for one chat dialog.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogEntry,
  OpenCodexThreadEventLogPage
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "./RootChildStore";
import type { RootStore } from "./RootStore";

const EVENT_LOG_LIMIT = 500;

/**
 * Stores one selected chat trace and applies live trace updates while open.
 */
export class ChatEventLogStore implements RootChildStore {
  /** Entries currently displayed by the event log dialog. */
  entries: OpenCodexThreadEventLogEntry[] = [];
  /** Thread currently displayed by the dialog. */
  activeThreadId: string | null = null;
  /** Source currently displayed by the dialog. */
  activeSourceId: string | null = null;
  /** Whether the initial or manual read is in progress. */
  isLoading = false;
  /** Last read error, when any. */
  error: string | null = null;
  /** Whether older entries were evicted from the backend ring buffer. */
  truncated = false;

  /**
   * Creates the chat event log store.
   *
   * @param root Root store used for backend requests.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<ChatEventLogStore, "root">(this, { root: false });
  }

  /**
   * Applies one backend event.
   *
   * @param event Backend event.
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "thread.eventLog.updated" || !this.isActiveThread(event.threadId, event.sourceId)) {
      return;
    }

    this.upsertEntry(event.entry);
  }

  /**
   * Opens a trace and loads its current entries.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier, or `null` for an orphaned thread.
   */
  open(threadId: string, sourceId: string | null): void {
    this.activeThreadId = threadId;
    this.activeSourceId = sourceId;
    this.entries = [];
    this.error = null;
    this.truncated = false;
    void this.load(threadId, sourceId);
  }

  /**
   * Closes the current trace.
   */
  close(): void {
    this.activeThreadId = null;
    this.activeSourceId = null;
    this.entries = [];
    this.error = null;
    this.truncated = false;
    this.isLoading = false;
  }

  /**
   * Reloads the currently selected trace.
   *
   * @returns Promise resolved after the read completes.
   */
  async refresh(): Promise<void> {
    if (this.activeThreadId === null) {
      return;
    }

    await this.load(this.activeThreadId, this.activeSourceId);
  }

  /**
   * Reads one bounded trace page from the backend.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier.
   * @returns Promise resolved after the read completes.
   */
  private async load(threadId: string, sourceId: string | null): Promise<void> {
    this.isLoading = true;

    try {
      const page = await this.root.request<OpenCodexThreadEventLogPage>({
        type: "threads.eventLog.read",
        threadId,
        sourceId,
        limit: EVENT_LOG_LIMIT
      });

      runInAction(() => {
        if (!this.isActiveThread(threadId, sourceId)) {
          return;
        }

        this.mergeEntries(page);
        this.isLoading = false;
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        if (!this.isActiveThread(threadId, sourceId)) {
          return;
        }

        this.isLoading = false;
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  /**
   * Merges a backend page with live entries received while it was loading.
   *
   * @param page Event page returned by the backend.
   */
  private mergeEntries(page: OpenCodexThreadEventLogPage): void {
    const entriesById = new Map(this.entries.map((entry) => [entry.id, entry]));

    for (const entry of page.entries) {
      entriesById.set(entry.id, entry);
    }

    this.entries = Array.from(entriesById.values())
      .sort((left, right) => left.sequence - right.sequence);
    this.truncated = page.truncated;
  }

  /**
   * Inserts or replaces one live entry in chronological order.
   *
   * @param entry Event entry received from the backend.
   */
  private upsertEntry(entry: OpenCodexThreadEventLogEntry): void {
    const entriesById = new Map(this.entries.map((current) => [current.id, current]));
    entriesById.set(entry.id, entry);
    this.entries = Array.from(entriesById.values())
      .sort((left, right) => left.sequence - right.sequence);
  }

  /**
   * Checks whether an event belongs to the currently displayed source/thread.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source identifier.
   * @returns Whether the dialog owns the event.
   */
  private isActiveThread(threadId: string, sourceId?: string | null): boolean {
    return this.activeThreadId === threadId &&
      this.activeSourceId === (sourceId ?? null);
  }
}
