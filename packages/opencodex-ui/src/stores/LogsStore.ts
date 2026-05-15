/**
 * Holds application log list state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

const LOG_PAGE_SIZE = 30;

/**
 * Stores persisted application logs for the Home logs view.
 */
export class LogsStore implements RootChildStore {
  logs: OpenCodexLogEntry[] = [];
  hasMore = false;
  isLoading = false;
  cleanupDialogOpen = false;
  cleanupMode: "olderThan" | "all" = "olderThan";
  cleanupAmount = 24;
  cleanupUnit: OpenCodexLogRetentionUnit = "hours";

  constructor(private readonly root: RootStore) {
    makeAutoObservable<LogsStore, "root">(this, { root: false });
  }

  /**
   * Applies backend log events.
   *
   * @param event Backend event.
   *
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type === "logs.created") {
      this.upsertCreatedLog(event.log);
    }

    if (event.type === "logs.deleted") {
      this.logs = this.logs.filter((log) => log.id !== event.logId);
    }

    if (event.type === "logs.cleared") {
      void this.loadLatest();
    }
  }

  /**
   * Loads the latest log page.
   *
   * @returns Promise resolved when loading completes.
   */
  async loadLatest(): Promise<void> {
    this.isLoading = true;

    try {
      const page = await this.root.request<OpenCodexLogPage>({
        type: "logs.list",
        limit: LOG_PAGE_SIZE
      });

      runInAction(() => {
        this.logs = page.logs;
        this.hasMore = page.hasMore;
        this.isLoading = false;
      });
    } catch {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Loads the next older page when available.
   *
   * @returns Promise resolved when loading completes.
   */
  async loadMore(): Promise<void> {
    if (this.isLoading || !this.hasMore || this.logs.length === 0) {
      return;
    }

    this.isLoading = true;
    const lastLog = this.logs.at(-1);

    if (lastLog === undefined) {
      return;
    }

    try {
      const page = await this.root.request<OpenCodexLogPage>({
        type: "logs.list",
        beforeCreatedAt: lastLog.createdAt,
        limit: LOG_PAGE_SIZE
      });

      runInAction(() => {
        this.logs = [...this.logs, ...page.logs];
        this.hasMore = page.hasMore;
        this.isLoading = false;
      });
    } catch {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Deletes one log entry.
   *
   * @param logId Log identifier.
   *
   * @returns Nothing.
   */
  deleteLog(logId: string): void {
    this.logs = this.logs.filter((log) => log.id !== logId);
    void this.root.request({ type: "logs.delete", logId });
  }

  /**
   * Opens the cleanup dialog.
   *
   * @returns Nothing.
   */
  openCleanupDialog(): void {
    this.cleanupDialogOpen = true;
  }

  /**
   * Closes the cleanup dialog.
   *
   * @returns Nothing.
   */
  closeCleanupDialog(): void {
    this.cleanupDialogOpen = false;
  }

  setCleanupMode(mode: "olderThan" | "all"): void {
    this.cleanupMode = mode;
  }

  setCleanupAmount(amount: number): void {
    this.cleanupAmount = amount;
  }

  setCleanupUnit(unit: OpenCodexLogRetentionUnit): void {
    this.cleanupUnit = unit;
  }

  /**
   * Applies the selected cleanup action.
   *
   * @returns Promise resolved when cleanup completes.
   */
  async applyCleanup(): Promise<void> {
    const mode = this.cleanupMode;
    const amount = this.cleanupAmount;
    const unit = this.cleanupUnit;

    this.cleanupDialogOpen = false;
    await this.root.request({
      type: "logs.clear",
      mode,
      amount,
      unit
    });
    await this.loadLatest();
  }

  private upsertCreatedLog(log: OpenCodexLogEntry): void {
    if (this.logs.some((entry) => entry.id === log.id)) {
      return;
    }

    this.logs = [log, ...this.logs].slice(0, this.hasMore ? this.logs.length : LOG_PAGE_SIZE);
  }
}
