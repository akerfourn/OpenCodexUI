import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryAggregation,
  OpenCodexUsageResetConsumeResult,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import { correctUsageLimitNotification } from "./usageCorrections.js";
import { readUsageHistory as readUsageHistoryFromCache } from "./usageHistory.js";
import { createUsageRateLimitHistorySnapshot } from "./usageRateLimitHistory.js";
import {
  UsageRateLimitDiagnostics,
  type UsageRateLimitLogOrigin,
  type UsageRateLimitLogReason
} from "./usageRateLimitDiagnostics.js";
import { mapUsageLimitsNotification, mapUsageLimitsResponse } from "./usageMapping.js";
import { readObject } from "../mapping.js";
import type {
  ApplicationLogPort,
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "./runtime/runtimePorts.js";

const DEFAULT_COMMIT_SOURCE_KEY = "__default_commit_source__";
const DEFAULT_COMMIT_MODEL_KEY = "__default_commit_model__";

/** Dependencies used by the source-scoped usage runtime service. */
export type UsageRuntimeServiceOptions = {
  /** Cache repository used for usage history, or `null` when disabled. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Reads the current settings, including the configured default source. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Resolves a requested source without silently selecting another source. */
  projects: Pick<ProjectSourcePort, "resolveRequestedSource">;
  /** Ensures a started Codex client for the canonical source identifier. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Whether pre-release diagnostics should be persisted. */
  isPrerelease: boolean;
  /** Emits usage changes to the UI transport. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Writes best-effort application diagnostics. */
  logs: ApplicationLogPort;
  /** Writes best-effort operational diagnostics. */
  logger?: (message: string) => void;
};

/** Coordinates usage reads, rate-limit notifications, and commit diagnostics. */
export class UsageRuntimeService {
  /** Deduplicates and persists pre-release rate-limit diagnostics. */
  private readonly usageRateLimitDiagnostics: UsageRateLimitDiagnostics;
  /** Counts active commit-message models grouped by source. */
  private readonly activeCommitModelsBySourceId = new Map<string, Map<string, number>>();

  /** Creates a source-scoped usage runtime service. */
  constructor(
    /** Source, client, cache, event, and diagnostic dependencies. */
    private readonly options: UsageRuntimeServiceOptions
  ) {
    this.usageRateLimitDiagnostics = new UsageRateLimitDiagnostics(
      options.isPrerelease,
      (type, message, details) => options.logs.persistLog(type, message, details)
    );
  }

  /**
   * Reads current Codex account usage limits.
   *
   * @param sourceId Requested source, or `null` for the configured default.
   * @param reason Reason for this read.
   * @returns Usage snapshot, or `null` when the source or request is unavailable.
   */
  async readUsageLimits(
    sourceId: string | null = null,
    reason: Exclude<UsageRateLimitLogReason, "accountRateLimitsUpdated"> = "request"
  ): Promise<OpenCodexUsageSnapshot | null> {
    let resolvedSource: CachedSource | null = null;

    try {
      resolvedSource = await this.options.projects.resolveRequestedSource(sourceId);
      const client = await this.options.clients.ensureClient(resolvedSource.id);
      const response = await client.request<v2.GetAccountRateLimitsResponse>(
        "account/rateLimits/read",
        undefined
      );
      const usage = mapUsageLimitsResponse(response, resolvedSource.id);
      this.recordUsageRateLimitDiagnostic(resolvedSource.id, usage, "read", reason);
      this.persistUsageRateLimitSnapshot(resolvedSource.id, response, usage, "read", reason);
      this.options.events.emit({ type: "usage.updated", sourceId: resolvedSource.id, usage });
      return usage;
    } catch (error) {
      this.options.logger?.(`account/rateLimits/read unavailable: ${String(error)}`);

      if (resolvedSource !== null) {
        this.options.events.emit({ type: "usage.updated", sourceId: resolvedSource.id, usage: null });
      }

      return null;
    }
  }

  /**
   * Reads source-scoped rate-limit and token usage history.
   *
   * @param sourceId Source whose history should be read.
   * @param from Inclusive ISO start timestamp.
   * @param to Exclusive ISO end timestamp.
   * @param aggregation Requested chart granularity.
   * @returns Aggregated usage history.
   */
  async readUsageHistory(
    sourceId: string,
    from: string,
    to: string,
    aggregation?: OpenCodexUsageHistoryAggregation
  ): Promise<OpenCodexUsageHistory> {
    return readUsageHistoryFromCache(this.options.cacheRepository, {
      sourceId,
      from,
      to,
      aggregation
    });
  }

  /**
   * Consumes one source-scoped banked rate-limit reset.
   *
   * @param sourceId Source identifier owning the account reset.
   * @param creditId Reset-credit identifier selected by the user.
   * @param idempotencyKey Stable key for this logical consume attempt.
   * @returns Codex consume outcome after refreshing source usage.
   */
  async consumeUsageReset(
    sourceId: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<OpenCodexUsageResetConsumeResult> {
    if (sourceId.trim().length === 0) {
      throw new Error("A source is required to consume a rate-limit reset.");
    }

    if (creditId.trim().length === 0) {
      throw new Error("A reset-credit identifier is required.");
    }

    if (idempotencyKey.trim().length === 0) {
      throw new Error("An idempotency key is required to consume a reset.");
    }

    const source = await this.options.projects.resolveRequestedSource(sourceId);
    const client = await this.options.clients.ensureClient(source.id);
    const response = await client.request<v2.ConsumeAccountRateLimitResetCreditResponse>(
      "account/rateLimitResetCredit/consume",
      {
        idempotencyKey,
        creditId
      }
    );

    await this.readUsageLimits(source.id, "resetConsume");

    return { outcome: response.outcome };
  }

  /**
   * Processes one account rate-limit update notification.
   *
   * @param sourceId Source that produced the notification.
   * @param params Raw notification parameters.
   * @returns Nothing.
   */
  handleRateLimitsUpdated(sourceId: string, params: unknown): void {
    const activeCommitModels = this.readActiveCommitModels(sourceId);
    const mappedUsage = mapUsageLimitsNotification(params, sourceId);
    const usage = correctUsageLimitNotification(mappedUsage, activeCommitModels);

    if (usage !== null) {
      this.recordUsageRateLimitDiagnostic(
        sourceId,
        usage,
        "notification",
        "accountRateLimitsUpdated",
        usage !== mappedUsage
      );
      this.persistUsageRateLimitSnapshot(
        sourceId,
        params,
        usage,
        "notification",
        "accountRateLimitsUpdated"
      );
      this.options.events.emit({ type: "usage.updated", sourceId, usage });
      return;
    }

    this.usageRateLimitDiagnostics.recordIgnoredNotification(
      sourceId,
      readObject(params).rateLimits,
      activeCommitModels
    );
  }

  /**
   * Refreshes source usage after a completed turn without blocking notification work.
   *
   * @param sourceId Source whose turn completed.
   * @returns Nothing.
   */
  handleTurnCompleted(sourceId: string): void {
    void this.readUsageLimits(sourceId, "turnCompleted");
  }

  /**
   * Tracks one active commit-message generation.
   *
   * @param sourceId Generation source, or `null` for the default source.
   * @param model Selected model, or `null` for Codex's default.
   * @returns Nothing.
   */
  onCommitGenerationStarted(sourceId: string | null, model: string | null): void {
    this.addActiveCommitModel(sourceId, model);
  }

  /**
   * Removes one active commit-message generation.
   *
   * @param sourceId Generation source, or `null` for the default source.
   * @param model Selected model, or `null` for Codex's default.
   * @returns Nothing.
   */
  onCommitGenerationFinished(sourceId: string | null, model: string | null): void {
    this.removeActiveCommitModel(sourceId, model);
  }

  /**
   * Records one source-scoped rate-limit diagnostic when the snapshot changed.
   *
   * @param sourceId Source owning the rate limits.
   * @param usage Rate-limit snapshot, or `null` when unavailable.
   * @param origin Snapshot origin.
   * @param reason Snapshot reason.
   * @param correctionApplied Whether corrective mapping changed the snapshot.
   * @returns Nothing.
   */
  private recordUsageRateLimitDiagnostic(
    sourceId: string,
    usage: OpenCodexUsageSnapshot | null,
    origin: UsageRateLimitLogOrigin,
    reason: UsageRateLimitLogReason,
    correctionApplied = false
  ): void {
    this.usageRateLimitDiagnostics.record(
      sourceId,
      usage,
      origin,
      reason,
      this.readActiveCommitModels(sourceId),
      correctionApplied
    );
  }

  /**
   * Persists one effective rate-limit snapshot without blocking notification work.
   *
   * @param sourceId Source owning the rate limits.
   * @param rawPayload Original Codex response or notification parameters.
   * @param usage Corrected mapped usage snapshot, or `null` when unavailable.
   * @param origin Snapshot origin.
   * @param reason Snapshot reason.
   * @returns Nothing.
   */
  private persistUsageRateLimitSnapshot(
    sourceId: string,
    rawPayload: unknown,
    usage: OpenCodexUsageSnapshot | null,
    origin: UsageRateLimitLogOrigin,
    reason: UsageRateLimitLogReason
  ): void {
    if (this.options.cacheRepository === null || usage === null) {
      return;
    }

    const snapshot = createUsageRateLimitHistorySnapshot(
      sourceId,
      rawPayload,
      usage,
      origin,
      reason
    );

    void this.options.cacheRepository.saveUsageRateLimitSnapshot(snapshot).catch((error) => {
      this.options.logger?.(`rate-limit history write failed: ${String(error)}`);
    });
  }

  /**
   * Marks a commit model as active for one source.
   *
   * @param sourceId Source used by generation, or `null` for the default.
   * @param model Model used by generation, or `null` for Codex's default.
   * @returns Nothing.
   */
  private addActiveCommitModel(sourceId: string | null, model: string | null): void {
    const sourceKey = this.readCommitSourceKey(sourceId);
    const modelKey = readCommitModelKey(model);
    const models = this.activeCommitModelsBySourceId.get(sourceKey) ?? new Map<string, number>();
    models.set(modelKey, (models.get(modelKey) ?? 0) + 1);
    this.activeCommitModelsBySourceId.set(sourceKey, models);
  }

  /**
   * Marks a commit model as finished for one source.
   *
   * @param sourceId Source used by generation, or `null` for the default.
   * @param model Model used by generation, or `null` for Codex's default.
   * @returns Nothing.
   */
  private removeActiveCommitModel(sourceId: string | null, model: string | null): void {
    const sourceKey = this.readCommitSourceKey(sourceId);
    const models = this.activeCommitModelsBySourceId.get(sourceKey);

    if (models === undefined) {
      return;
    }

    const modelKey = readCommitModelKey(model);
    const activeCount = models.get(modelKey) ?? 0;

    if (activeCount <= 1) {
      models.delete(modelKey);
    } else {
      models.set(modelKey, activeCount - 1);
    }

    if (models.size === 0) {
      this.activeCommitModelsBySourceId.delete(sourceKey);
    }
  }

  /**
   * Reads active commit models in diagnostic-friendly form.
   *
   * @param sourceId Source owning the notification.
   * @returns Active models, with `null` representing Codex's default model.
   */
  private readActiveCommitModels(sourceId: string): Array<string | null> {
    const models = this.activeCommitModelsBySourceId.get(sourceId);

    if (models === undefined) {
      return [];
    }

    return Array.from(models.keys()).map((model) => (
      model === DEFAULT_COMMIT_MODEL_KEY ? null : model
    ));
  }

  /**
   * Resolves the map key used for a commit generation source.
   *
   * @param sourceId Explicit source identifier, or `null` for the default.
   * @returns Stable source key.
   */
  private readCommitSourceKey(sourceId: string | null): string {
    return sourceId ?? this.options.settings.getSettings().defaultSourceId ?? DEFAULT_COMMIT_SOURCE_KEY;
  }
}

/**
 * Converts a nullable commit model into a stable diagnostic map key.
 *
 * @param model Selected commit model, or `null` for Codex's default.
 * @returns Stable model key.
 */
function readCommitModelKey(model: string | null): string {
  return model ?? DEFAULT_COMMIT_MODEL_KEY;
}
