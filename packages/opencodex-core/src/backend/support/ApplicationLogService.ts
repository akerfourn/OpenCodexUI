import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexLogCategory,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit,
  OpenCodexLogType,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import type { RuntimeEventPort, RuntimeSettingsPort } from "../runtime/runtimePorts.js";
import {
  createDefaultLogPolicies,
  DEFAULT_LOG_PAGE_SIZE,
  MAX_LOG_PAGE_SIZE,
  areLogPoliciesEqual,
  readLogPolicies,
  resolveLogPolicy,
  type ApplicationLogPolicies
} from "./applicationLogPolicies.js";
import {
  SessionLogBuffer,
  type SessionLogInput
} from "./SessionLogBuffer.js";
import { cloneJsonValue } from "./applicationLogSerialization.js";

const RETENTION_PURGE_INTERVAL_MS = 60 * 60 * 1000;

type ApplicationLogEventPort = Pick<RuntimeEventPort, "emit">;

/** Dependencies used by the application log service. */
export type ApplicationLogServiceOptions = {
  /** Cache repository used to persist and query logs, or `null` when unavailable. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Reads the current settings snapshot used to resolve log policies. */
  settings?: Pick<RuntimeSettingsPort, "getSettings">;
  /** Emits log state changes to the UI transport. */
  events: ApplicationLogEventPort;
  /** Writes best-effort persistence diagnostics. */
  logger?: (message: string) => void;
  /** Provides the current time for retention calculations and session timestamps. */
  now?: () => Date;
  /** Overrides the periodic purge interval for deterministic tests. */
  retentionPurgeIntervalMs?: number;
};

/** Coordinates application log persistence, process-local logs, and UI events. */
export class ApplicationLogService {
  /** Process-local log buffer with count and byte bounds. */
  private readonly sessionBuffer: SessionLogBuffer;
  /** Current policies after the last successful settings save. */
  private policies: ApplicationLogPolicies;
  /** Serialized service operations, including writes, reads, and pruning. */
  private operationQueue: Promise<void> = Promise.resolve();
  /** Periodic retained-log purge handle. */
  private purgeTimer: ReturnType<typeof setInterval> | null = null;
  /** Prevents timers and writes from running after disposal. */
  private isDisposed = false;

  /** Creates an application log service. */
  constructor(
    /** Cache, event, logging, settings, and time dependencies. */
    private readonly options: ApplicationLogServiceOptions
  ) {
    this.policies = this.readCurrentPolicies();
    this.sessionBuffer = new SessionLogBuffer(() => this.readCurrentTime());
  }

  /** Starts periodic retention maintenance and performs one immediate purge. */
  async start(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    if (this.purgeTimer === null) {
      const intervalMs = this.normalizePurgeInterval(
        this.options.retentionPurgeIntervalMs ?? RETENTION_PURGE_INTERVAL_MS
      );
      this.purgeTimer = setInterval(() => {
        if (this.isDisposed) {
          return;
        }

        void this.enqueue(async () => {
          await this.purgeRetainedLogs(this.policies);
        }).catch((error: unknown) => {
          this.reportMaintenanceFailure("periodic application log purge", error);
        });
      }, intervalMs);
      this.unrefTimer(this.purgeTimer);
    }

    await this.enqueue(async () => {
      await this.purgeRetainedLogs(this.policies);
    });
  }

  /** Stops timers, clears process-local logs, and waits for queued work. */
  async dispose(): Promise<void> {
    this.isDisposed = true;
    if (this.purgeTimer !== null) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
    await this.operationQueue;
    this.sessionBuffer.clear();
  }

  /**
   * Applies policies after settings persistence succeeds.
   *
   * Existing persisted history is kept when a policy becomes disabled or
   * session-only. Session entries affected by a disabled policy are removed;
   * retained policies prune only their matching persisted history.
   *
   * @param settings Settings snapshot that was successfully saved.
   * @returns Promise resolved when best-effort maintenance has completed.
   */
  async applySettings(settings: OpenCodexSettings): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    const nextPolicies = readLogPolicies(settings);
    await this.enqueue(async () => {
      if (areLogPoliciesEqual(this.policies, nextPolicies)) {
        return;
      }

      this.policies = nextPolicies;
      this.emitDeleted(this.sessionBuffer.trimForPolicies((type, category) => (
        resolveLogPolicy(type, category, this.policies)
      )));
      await this.purgeRetainedLogs(nextPolicies);
    });
  }

  /**
   * Lists application logs from memory and persistence in one newest-first page.
   *
   * @param beforeCreatedAt Optional pagination timestamp cursor.
   * @param limit Maximum number of entries to read.
   * @param types Optional severities to include.
   * @param beforeId Optional id tie-breaker for equal timestamps.
   * @returns Unified log page.
   */
  async listLogs(
    beforeCreatedAt: string | null,
    limit: number,
    types?: OpenCodexLogType[],
    beforeId?: string | null
  ): Promise<OpenCodexLogPage> {
    if (this.isDisposed) {
      return { logs: [], hasMore: false };
    }

    return await this.enqueue(async () => {
      const normalizedLimit = this.normalizePageLimit(limit);
      if (types !== undefined && types.length === 0) {
        return { logs: [], hasMore: false };
      }

      const persistedPage = this.options.cacheRepository === null
        ? { logs: [], hasMore: false }
        : await this.options.cacheRepository.listLogs({
            beforeCreatedAt,
            limit: normalizedLimit,
            ...(types === undefined ? {} : { types }),
            ...(beforeId === undefined || beforeId === null ? {} : { beforeId })
          });
      const persistedLogs = persistedPage.logs.map((log) => this.toPersistentLog(log));
      const sessionLogs = this.sessionBuffer.read(beforeCreatedAt, types, beforeId);
      const mergedLogs = [...persistedLogs, ...sessionLogs].sort(compareLogs);

      return {
        logs: mergedLogs.slice(0, normalizedLimit),
        hasMore: persistedPage.hasMore || mergedLogs.length > normalizedLimit
      };
    });
  }

  /** Deletes one application log from persistence and the session buffer. */
  async deleteLog(logId: string): Promise<{ ok: true }> {
    if (this.isDisposed) {
      return { ok: true };
    }

    return await this.enqueue(async () => {
      await this.options.cacheRepository?.deleteLog(logId);
      this.sessionBuffer.remove(logId);
      this.options.events.emit({ type: "logs.deleted", logId });
      return { ok: true };
    });
  }

  /** Clears persisted and session application logs. */
  async clearLogs(
    mode: "all" | "olderThan",
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): Promise<{ ok: true }> {
    if (this.isDisposed) {
      return { ok: true };
    }

    return await this.enqueue(async () => {
      if (mode === "all") {
        await this.options.cacheRepository?.clearLogs();
        this.sessionBuffer.clear();
      } else {
        const cutoff = this.calculateRetentionCutoff(amount, unit);
        await this.options.cacheRepository?.clearLogsOlderThan(cutoff);
        this.sessionBuffer.removeOlderThan(cutoff);
      }

      this.options.events.emit({ type: "logs.cleared" });
      return { ok: true };
    });
  }

  /** Creates an application log according to the current retention policy. */
  async createLog(
    type: OpenCodexLogType,
    message: string,
    details: unknown,
    category?: OpenCodexLogCategory
  ): Promise<{ ok: true }> {
    if (this.isDisposed) {
      return { ok: true };
    }

    const input: SessionLogInput = {
      type,
      message,
      details: cloneJsonValue(details),
      ...(category === undefined ? {} : { category })
    };
    return await this.enqueue(async () => {
      await this.routeLog(input);
      return { ok: true };
    });
  }

  /** Starts a best-effort application log write without propagating failures. */
  persistLog(
    type: OpenCodexLogType,
    message: string,
    details: unknown,
    category?: OpenCodexLogCategory
  ): void {
    if (this.isDisposed) {
      return;
    }

    const input: SessionLogInput = {
      type,
      message,
      details: cloneJsonValue(details),
      ...(category === undefined ? {} : { category })
    };
    void this.enqueue(() => {
      return this.routeLog(input);
    }).catch((error: unknown) => {
      this.reportMaintenanceFailure("application log write", error);
    });
  }

  /** Routes one log to disabled, session, or persistent storage. */
  private async routeLog(input: SessionLogInput): Promise<void> {
    const policy = resolveLogPolicy(input.type, input.category, this.policies);
    if (policy.mode === "disabled") {
      return;
    }

    if (policy.mode === "session") {
      const result = this.sessionBuffer.add(input, policy.maxEntries);
      if (result.log === null) {
        this.reportMaintenanceFailure(
          "session application log buffer",
          new Error("entry exceeds the byte limit")
        );
        return;
      }

      this.options.events.emit({ type: "logs.created", log: result.log });
      this.emitDeleted(result.evictedIds);
      return;
    }

    if (this.options.cacheRepository === null) {
      return;
    }

    const createdLog = await this.options.cacheRepository.createLog({
      type: input.type,
      message: input.message,
      details: cloneJsonValue(input.details),
      ...(input.category === undefined ? {} : { category: input.category })
    });
    this.options.events.emit({ type: "logs.created", log: this.toPersistentLog(createdLog) });
  }

  /** Purges expired persistent entries for all retained policies. */
  private async purgeRetainedLogs(policies: ApplicationLogPolicies): Promise<void> {
    const repository = this.options.cacheRepository;
    if (repository === null) {
      return;
    }

    const requests: Array<{
      retentionDays: number;
      filter: {
        type?: OpenCodexLogType;
        category?: OpenCodexLogCategory;
        excludeCategory?: OpenCodexLogCategory;
      };
    }> = [];
    if (policies.info.mode === "retained") {
      requests.push({
        retentionDays: policies.info.retentionDays,
        filter: { type: "info", excludeCategory: "performanceSlowdown" }
      });
    }
    if (policies.performanceSlowdown.mode === "retained") {
      requests.push({
        retentionDays: policies.performanceSlowdown.retentionDays,
        filter: { category: "performanceSlowdown" }
      });
    }

    let completed = false;
    for (const request of requests) {
      try {
        await repository.clearLogsOlderThan(
          this.calculateDaysCutoff(request.retentionDays),
          request.filter
        );
        completed = true;
      } catch (error: unknown) {
        this.reportMaintenanceFailure("retained application log purge", error);
      }
    }

    if (completed) {
      this.options.events.emit({ type: "logs.cleared" });
    }
  }

  /** Maps a cache entry to the public persistent-storage representation. */
  private toPersistentLog(log: {
    id: string;
    type: OpenCodexLogType;
    message: string;
    details: unknown;
    createdAt: string;
    category?: OpenCodexLogCategory;
  }): OpenCodexLogEntry {
    return {
      id: log.id,
      type: log.type,
      message: log.message,
      details: cloneJsonValue(log.details),
      createdAt: log.createdAt,
      storage: "persistent",
      ...(log.category === undefined ? {} : { category: log.category })
    };
  }

  /** Emits one deletion event for each session entry evicted by a bound. */
  private emitDeleted(logIds: string[]): void {
    for (const logId of logIds) {
      this.options.events.emit({ type: "logs.deleted", logId });
    }
  }

  /** Reads and validates the current policy snapshot from the settings provider. */
  private readCurrentPolicies(): ApplicationLogPolicies {
    if (this.options.settings === undefined) {
      return createDefaultLogPolicies();
    }

    try {
      return readLogPolicies(this.options.settings.getSettings());
    } catch (error: unknown) {
      this.reportMaintenanceFailure("application log policy load", error);
      return createDefaultLogPolicies();
    }
  }

  /** Calculates a day-based retention cutoff using the injected clock. */
  private calculateDaysCutoff(retentionDays: number): string {
    const currentTime = this.readCurrentTime();
    return new Date(currentTime.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  }

  /** Calculates the ISO cutoff used by manual log cleanup. */
  private calculateRetentionCutoff(
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): string {
    const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 24;
    const cutoff = this.readCurrentTime();

    if (unit === "hours") {
      cutoff.setHours(cutoff.getHours() - normalizedAmount);
    }
    if (unit === "days") {
      cutoff.setDate(cutoff.getDate() - normalizedAmount);
    }
    if (unit === "weeks") {
      cutoff.setDate(cutoff.getDate() - normalizedAmount * 7);
    }
    if (unit === "months") {
      cutoff.setMonth(cutoff.getMonth() - normalizedAmount);
    }

    return cutoff.toISOString();
  }

  /** Reads a valid current time, falling back when a test clock returns an invalid date. */
  private readCurrentTime(): Date {
    const candidate = this.options.now?.() ?? new Date();
    return Number.isNaN(candidate.getTime()) ? new Date() : new Date(candidate.getTime());
  }

  /** Normalizes public page sizes to the cache-supported range. */
  private normalizePageLimit(limit: number): number {
    if (!Number.isFinite(limit) || limit <= 0) {
      return DEFAULT_LOG_PAGE_SIZE;
    }

    return Math.min(Math.floor(limit), MAX_LOG_PAGE_SIZE);
  }

  /** Normalizes a periodic timer interval to a safe positive integer. */
  private normalizePurgeInterval(intervalMs: number): number {
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      return RETENTION_PURGE_INTERVAL_MS;
    }

    return intervalMs;
  }

  /** Releases timer references when the runtime supports Node's `unref`. */
  private unrefTimer(timer: ReturnType<typeof setInterval>): void {
    if (typeof timer === "object" && timer !== null && "unref" in timer) {
      const unref = timer.unref;
      if (typeof unref === "function") {
        unref.call(timer);
      }
    }
  }

  /** Adds operation work without allowing one failure to block later work. */
  private enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const task = this.operationQueue.then(operation);
    this.operationQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  /** Emits a best-effort diagnostic without allowing logger failures to escape. */
  private reportMaintenanceFailure(operation: string, error: unknown): void {
    try {
      this.options.logger?.(`${operation} failed: ${String(error)}`);
    } catch {
      // Logging is deliberately best effort and must not recurse into this service.
    }
  }
}

/** Compares logs newest-first with codepoint ordering matching SQLite. */
function compareLogs(left: OpenCodexLogEntry, right: OpenCodexLogEntry): number {
  if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? 1 : -1;
  }
  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? 1 : -1;
}
