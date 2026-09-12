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
const MAX_LIVE_LOGS = 300;
const MAX_PENDING_DELETED_LOG_IDS = 1_000;
const MAX_PENDING_CREATED_LOGS = 300;

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
  /** Deleted ids observed while the current page request is in flight. */
  private pendingDeletedLogIds = new Set<string>();
  /** Whether a deletion burst exceeded the bounded per-request id set. */
  private pendingRequestNeedsRefresh = false;
  /** Live entries created while the current page request is in flight. */
  private pendingCreatedLogs = new Map<string, OpenCodexLogEntry>();

  /**
   * Creates the logs store.
   *
   * @param root Root store used for backend requests.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<
      LogsStore,
      | "root"
      | "logsRequestId"
      | "pendingDeletedLogIds"
      | "pendingRequestNeedsRefresh"
      | "pendingCreatedLogs"
    >(this, {
      root: false,
      logsRequestId: false,
      pendingDeletedLogIds: false,
      pendingRequestNeedsRefresh: false,
      pendingCreatedLogs: false
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
      this.rememberCreatedLog(event.log);
      this.upsertCreatedLog(event.log);
    }

    if (event.type === "logs.deleted") {
      this.rememberDeletedLog(event.logId);
      this.pendingCreatedLogs.delete(event.logId);
      this.logs = this.logs.filter((log) => log.id !== event.logId);
      this.refreshEmptyHistoryPage();
    }

    if (event.type === "logs.cleared") {
      this.invalidatePendingRequests();
      this.logs = [];
      this.hasMore = false;
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
    this.resetPendingLogChanges();
    this.isLoading = true;
    let shouldRefresh = false;

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

        if (this.pendingRequestNeedsRefresh) {
          this.isLoading = false;
          this.resetPendingLogChanges();
          shouldRefresh = true;
          return;
        }

        const liveLogs = this.filterPendingDeletedLogs([...this.pendingCreatedLogs.values()]);
        const pageLogs = this.filterPendingDeletedLogs(page.logs);
        const mergedLogs = mergeLogs(pageLogs, liveLogs);
        const maxLogs = Math.max(LOG_PAGE_SIZE, liveLogs.length);
        this.logs = mergedLogs.slice(0, maxLogs);
        this.hasMore = page.hasMore || mergedLogs.length > maxLogs;
        this.isLoading = false;
        this.resetPendingLogChanges();
        shouldRefresh = this.logs.length === 0 && this.hasMore;
      });

      if (shouldRefresh) {
        void this.loadLatest();
      }
    } catch {
      runInAction(() => {
        if (requestId === this.logsRequestId) {
          this.isLoading = false;
          this.resetPendingLogChanges();
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

    const lastLog = this.logs.at(-1);

    if (lastLog === undefined) {
      return;
    }

    this.isLoading = true;
    const requestId = ++this.logsRequestId;
    const types = [...this.visibleLogTypes];
    this.resetPendingLogChanges();
    let shouldRefresh = false;

    try {
      const page = await this.root.request<OpenCodexLogPage>({
        type: "logs.list",
        beforeCreatedAt: lastLog.createdAt,
        beforeId: lastLog.id,
        limit: LOG_PAGE_SIZE,
        types
      });

      runInAction(() => {
        if (requestId !== this.logsRequestId) {
          return;
        }

        if (this.pendingRequestNeedsRefresh) {
          this.isLoading = false;
          this.resetPendingLogChanges();
          shouldRefresh = true;
          return;
        }

        this.logs = mergeLogs(this.logs, this.filterPendingDeletedLogs(page.logs));
        this.hasMore = page.hasMore;
        this.isLoading = false;
        this.resetPendingLogChanges();
        shouldRefresh = this.logs.length === 0 && this.hasMore;
      });

      if (shouldRefresh) {
        void this.loadLatest();
      }
    } catch {
      runInAction(() => {
        if (requestId === this.logsRequestId) {
          this.isLoading = false;
          this.resetPendingLogChanges();
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
    this.rememberDeletedLog(logId);
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

    const existingLogs = this.logs.filter((entry) => entry.id !== log.id);
    const nextLogs = [log, ...existingLogs];
    const maxLogs = Math.max(this.logs.length, MAX_LIVE_LOGS);
    if (nextLogs.length > maxLogs) {
      this.hasMore = true;
    }

    this.logs = nextLogs.sort(compareLogs).slice(0, maxLogs);
  }

  /** Records a deletion only for the active request, then clears it on settlement. */
  private rememberDeletedLog(logId: string): void {
    if (!this.isLoading) {
      return;
    }

    if (this.pendingDeletedLogIds.size < MAX_PENDING_DELETED_LOG_IDS) {
      this.pendingDeletedLogIds.add(logId);
      return;
    }

    this.pendingRequestNeedsRefresh = true;
  }

  /** Keeps relevant live entries so an in-flight latest-page response cannot erase them. */
  private rememberCreatedLog(log: OpenCodexLogEntry): void {
    if (!this.isLoading || !this.visibleLogTypes.includes(log.type)) {
      return;
    }

    if (this.pendingCreatedLogs.size >= MAX_PENDING_CREATED_LOGS) {
      const oldestId = this.pendingCreatedLogs.keys().next().value;
      if (oldestId !== undefined) {
        this.pendingCreatedLogs.delete(oldestId);
      }
    }

    this.pendingCreatedLogs.set(log.id, log);
  }

  /** Removes ids deleted while a page request was running. */
  private filterPendingDeletedLogs(logs: OpenCodexLogEntry[]): OpenCodexLogEntry[] {
    if (this.pendingDeletedLogIds.size === 0) {
      return logs;
    }

    return logs.filter((log) => !this.pendingDeletedLogIds.has(log.id));
  }

  /** Invalidates in-flight pages when the backend clears the complete history. */
  private invalidatePendingRequests(): void {
    this.logsRequestId += 1;
    this.isLoading = false;
    this.resetPendingLogChanges();
  }

  /** Clears bounded live-change tracking when a request settles or is superseded. */
  private resetPendingLogChanges(): void {
    this.pendingDeletedLogIds.clear();
    this.pendingRequestNeedsRefresh = false;
    this.pendingCreatedLogs.clear();
  }

  /** Refetches when deletion leaves an empty page with older history available. */
  private refreshEmptyHistoryPage(): void {
    if (!this.isLoading && this.logs.length === 0 && this.hasMore) {
      void this.loadLatest();
    }
  }
}

/** Merges an older page into the newest-first renderer history without dropping requested pages. */
function mergeLogs(
  currentLogs: OpenCodexLogEntry[],
  nextPage: OpenCodexLogEntry[]
): OpenCodexLogEntry[] {
  const mergedLogs: OpenCodexLogEntry[] = [];
  const seenIds = new Set<string>();

  for (const log of [...currentLogs, ...nextPage]) {
    if (seenIds.has(log.id)) {
      continue;
    }

    seenIds.add(log.id);
    mergedLogs.push(log);
  }

  return mergedLogs.sort(compareLogs);
}

/** Sorts newest-first with the same timestamp and id tie-breaker as the backend. */
function compareLogs(left: OpenCodexLogEntry, right: OpenCodexLogEntry): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }

  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}
