/**
 * Holds application log list state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogType,
  OpenCodexLogRetentionUnit
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../RootStore";
import type { RootChildStore } from "../RootChildStore";

const LOG_PAGE_SIZE = 30;

/**
 * Stores persisted application logs for the Home logs view.
 */
export class LogsStore implements RootChildStore {
  /** Log entries currently loaded in newest-first order. */
  logs: OpenCodexLogEntry[] = [];
  /** Whether older log pages are available. */
  hasMore = false;
  /** Whether a log page is currently loading. */
  isLoading = false;
  /** Log severities shown by the global log view. */
  visibleLogTypes: OpenCodexLogType[] = ["error", "warning"];
  /** Whether the cleanup confirmation dialog is open. */
  cleanupDialogOpen = false;
  /** Cleanup mode selected in the cleanup dialog. */
  cleanupMode: "olderThan" | "all" = "olderThan";
  /** Amount paired with `cleanupUnit` for retention cleanup. */
  cleanupAmount = 24;
  /** Unit paired with `cleanupAmount` for retention cleanup. */
  cleanupUnit: OpenCodexLogRetentionUnit = "hours";
  /** Invalidates log responses that belong to an older filter or pagination request. */
  private logsRequestId = 0;

  /**
   * Creates the logs store.
   *
   * @param root Root store used for backend requests.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<LogsStore, "root" | "logsRequestId">(this, {
      root: false,
      logsRequestId: false
    });
  }

  /**
   * Returns loaded logs matching the selected severities.
   *
   * @returns Filtered logs in newest-first order.
   */
  get visibleLogs(): OpenCodexLogEntry[] {
    return this.logs.filter((log) => this.visibleLogTypes.includes(log.type));
  }

  /**
   * Changes the severities shown by the global log view.
   *
   * @param types Severities to display.
   */
  setVisibleLogTypes(types: OpenCodexLogType[]): void {
    this.visibleLogTypes = [...new Set(types)];
    this.logs = [];
    this.hasMore = false;
    void this.loadLatest();
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
    const requestId = ++this.logsRequestId;
    const types = [...this.visibleLogTypes];
    this.isLoading = true;

    try {
      const page = await this.root.request<OpenCodexLogPage>({
        type: "logs.list",
        limit: LOG_PAGE_SIZE,
        types
      });

      runInAction(() => {
        if (requestId !== this.logsRequestId) {
          return;
        }

        this.logs = page.logs;
        this.hasMore = page.hasMore;
        this.isLoading = false;
      });
    } catch {
      runInAction(() => {
        if (requestId === this.logsRequestId) {
          this.isLoading = false;
        }
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

    const requestId = ++this.logsRequestId;
    const types = [...this.visibleLogTypes];

    try {
      const page = await this.root.request<OpenCodexLogPage>({
        type: "logs.list",
        beforeCreatedAt: lastLog.createdAt,
        limit: LOG_PAGE_SIZE,
        types
      });

      runInAction(() => {
        if (requestId !== this.logsRequestId) {
          return;
        }

        this.logs = [...this.logs, ...page.logs];
        this.hasMore = page.hasMore;
        this.isLoading = false;
      });
    } catch {
      runInAction(() => {
        if (requestId === this.logsRequestId) {
          this.isLoading = false;
        }
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

  /**
   * Changes the cleanup mode.
   *
   * @param mode Cleanup mode.
   */
  setCleanupMode(mode: "olderThan" | "all"): void {
    this.cleanupMode = mode;
  }

  /**
   * Changes the cleanup retention amount.
   *
   * @param amount Retention amount.
   */
  setCleanupAmount(amount: number): void {
    this.cleanupAmount = amount;
  }

  /**
   * Changes the cleanup retention unit.
   *
   * @param unit Retention unit.
   */
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

  /**
   * Inserts a newly created log entry without duplicating existing rows.
   *
   * @param log Created log entry.
   */
  private upsertCreatedLog(log: OpenCodexLogEntry): void {
    if (!this.visibleLogTypes.includes(log.type)) {
      return;
    }

    if (this.logs.some((entry) => entry.id === log.id)) {
      return;
    }

    this.logs = [log, ...this.logs].slice(0, this.hasMore ? this.logs.length : LOG_PAGE_SIZE);
  }
}
