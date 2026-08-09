import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit
} from "@open-codex-ui/opencodex-protocol";

/** Dependencies used by the application log service. */
export type ApplicationLogServiceOptions = {
  /** Cache repository used to persist and query logs, or `null` when unavailable. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Emits log state changes to the UI transport. */
  emit(event: OpenCodexEvent): void;
  /** Writes best-effort persistence diagnostics. */
  logger?: (message: string) => void;
  /** Provides the current time for retention calculations. */
  now?: () => Date;
};

/** Coordinates application log persistence and UI events. */
export class ApplicationLogService {
  /** Creates an application log service. */
  constructor(
    /** Cache, event, logging, and time dependencies. */
    private readonly options: ApplicationLogServiceOptions
  ) {}

  /**
   * Lists persisted application logs.
   *
   * @param beforeCreatedAt Optional pagination cursor.
   * @param limit Maximum number of entries to read.
   * @returns Log page, or an empty page when persistence is unavailable.
   */
  async listLogs(beforeCreatedAt: string | null, limit: number): Promise<OpenCodexLogPage> {
    if (this.options.cacheRepository === null) {
      return { logs: [], hasMore: false };
    }

    return await this.options.cacheRepository.listLogs({ beforeCreatedAt, limit });
  }

  /**
   * Deletes one persisted application log.
   *
   * @param logId Log identifier.
   * @returns Success result.
   */
  async deleteLog(logId: string): Promise<{ ok: true }> {
    await this.options.cacheRepository?.deleteLog(logId);
    this.options.emit({ type: "logs.deleted", logId });
    return { ok: true };
  }

  /**
   * Clears persisted application logs.
   *
   * @param mode Clear mode.
   * @param amount Retention amount when keeping recent logs.
   * @param unit Retention unit when keeping recent logs.
   * @returns Success result.
   */
  async clearLogs(
    mode: "all" | "olderThan",
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): Promise<{ ok: true }> {
    if (mode === "all") {
      await this.options.cacheRepository?.clearLogs();
    } else {
      await this.options.cacheRepository?.clearLogsOlderThan(
        this.calculateRetentionCutoff(amount, unit)
      );
    }

    this.options.emit({ type: "logs.cleared" });
    return { ok: true };
  }

  /**
   * Persists an application log entry and emits the created event.
   *
   * @param type Log severity.
   * @param message User-facing log message.
   * @param details Optional structured diagnostic details.
   * @returns Success result, or an immediate success when persistence is unavailable.
   */
  async createLog(
    type: OpenCodexLogEntry["type"],
    message: string,
    details: unknown
  ): Promise<{ ok: true }> {
    if (this.options.cacheRepository === null) {
      return { ok: true };
    }

    const log = await this.options.cacheRepository.createLog({ type, message, details });
    this.options.emit({ type: "logs.created", log });

    return { ok: true };
  }

  /**
   * Starts a best-effort application log write without propagating failures.
   *
   * @param type Log severity.
   * @param message User-facing log message.
   * @param details Optional structured diagnostic details.
   * @returns Nothing.
   */
  persistLog(
    type: OpenCodexLogEntry["type"],
    message: string,
    details: unknown
  ): void {
    if (this.options.cacheRepository === null) {
      return;
    }

    void this.options.cacheRepository.createLog({ type, message, details }).then((log) => {
      this.options.emit({ type: "logs.created", log });
    }).catch((error: unknown) => {
      this.options.logger?.(`application log write failed: ${String(error)}`);
    });
  }

  /**
   * Calculates the ISO cutoff used when deleting old logs.
   *
   * @param amount Retention amount selected by the user.
   * @param unit Retention unit selected by the user.
   * @returns ISO timestamp before which logs can be removed.
   */
  private calculateRetentionCutoff(
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): string {
    const normalizedAmount = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 24;
    const currentTime = this.options.now?.() ?? new Date();
    const cutoff = new Date(currentTime.getTime());

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
}
