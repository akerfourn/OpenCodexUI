/**
 * Persists de-duplicated rate-limit diagnostics for pre-release builds.
 */
import type {
  OpenCodexLogType,
  OpenCodexUsageLimits,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import { readObject } from "../mapping.js";

export type UsageRateLimitLogOrigin = "read" | "notification";

export type UsageRateLimitLogReason =
  | "bootstrap"
  | "request"
  | "turnCompleted"
  | "resetConsume"
  | "accountRateLimitsUpdated";

type UsageRateLimitLogDetails = {
  sourceId: string;
  origin: UsageRateLimitLogOrigin;
  reason: UsageRateLimitLogReason;
  activeCommitModels: Array<string | null>;
  mapping: "mapped" | "ignored";
  limits: OpenCodexUsageLimits[];
  rawRateLimits?: Record<string, unknown>;
};

type LogWriter = (
  type: OpenCodexLogType,
  message: string,
  details: UsageRateLimitLogDetails
) => void;

/**
 * Tracks the latest effective limit values so periodic reads do not create
 * duplicate diagnostic entries.
 */
export class UsageRateLimitDiagnostics {
  private readonly lastLimitsBySourceId = new Map<string, Map<string, string>>();
  private readonly lastIgnoredNotificationBySourceId = new Map<string, string>();

  /**
   * Creates a rate-limit diagnostic tracker.
   *
   * @param isPrerelease Whether diagnostics are enabled for this build.
   * @param writeLog Callback used to persist one application log.
   */
  constructor(
    private readonly isPrerelease: boolean,
    private readonly writeLog: LogWriter
  ) {}

  /**
   * Records a snapshot only when at least one effective limit value changed.
   *
   * @param sourceId Source owning the account limits.
   * @param snapshot Rate-limit snapshot, or `null` when unavailable.
   * @param origin Whether the snapshot came from a read or notification.
   * @param reason More precise reason for the snapshot.
   * @param activeCommitModels Commit models currently generating on the source.
   */
  record(
    sourceId: string,
    snapshot: OpenCodexUsageSnapshot | null,
    origin: UsageRateLimitLogOrigin,
    reason: UsageRateLimitLogReason,
    activeCommitModels: Array<string | null>
  ): void {
    if (!this.isPrerelease || snapshot === null || snapshot.limits.length === 0) {
      return;
    }

    const previousLimits = this.lastLimitsBySourceId.get(sourceId) ?? new Map();
    const incomingLimits = mapLimitSignatures(snapshot.limits);
    const nextLimits = origin === "read"
      ? new Map(incomingLimits)
      : new Map(previousLimits);
    let hasChanged = origin === "read" && hasRemovedLimit(previousLimits, incomingLimits);

    for (const [limitId, signature] of incomingLimits) {
      if (previousLimits.get(limitId) !== signature) {
        hasChanged = true;
      }

      nextLimits.set(limitId, signature);
    }

    if (!hasChanged) {
      return;
    }

    this.lastLimitsBySourceId.set(sourceId, nextLimits);
    this.writeLog("info", "Codex rate limits updated", {
      sourceId,
      origin,
      reason,
      activeCommitModels,
      mapping: "mapped",
      limits: snapshot.limits
    });
  }

  /**
   * Records an ambiguous sparse notification that the UI deliberately ignores.
   *
   * @param sourceId Source owning the notification.
   * @param rateLimits Raw rate-limit object from the notification.
   * @param activeCommitModels Commit models currently generating on the source.
   * @returns Nothing.
   */
  recordIgnoredNotification(
    sourceId: string,
    rateLimits: unknown,
    activeCommitModels: Array<string | null>
  ): void {
    if (!this.isPrerelease) {
      return;
    }

    const normalizedRateLimits = readObject(rateLimits);

    if (Object.keys(normalizedRateLimits).length === 0) {
      return;
    }

    const signature = JSON.stringify(normalizedRateLimits);

    if (this.lastIgnoredNotificationBySourceId.get(sourceId) === signature) {
      return;
    }

    this.lastIgnoredNotificationBySourceId.set(sourceId, signature);
    this.writeLog("info", "Codex rate-limit notification ignored", {
      sourceId,
      origin: "notification",
      reason: "accountRateLimitsUpdated",
      activeCommitModels,
      mapping: "ignored",
      limits: [],
      rawRateLimits: normalizedRateLimits
    });
  }
}

/**
 * Creates stable signatures for the limits in one snapshot.
 *
 * @param limits Usage limits to compare.
 * @returns Signatures keyed by limit identifier.
 */
function mapLimitSignatures(limits: OpenCodexUsageLimits[]): Map<string, string> {
  const signatures = new Map<string, string>();

  limits.forEach((limit, index) => {
    const limitId = limit.limitId ?? `__missing__${index}`;
    signatures.set(limitId, JSON.stringify(limit));
  });

  return signatures;
}

/**
 * Checks whether a full read removed a previously observed limit.
 *
 * @param previousLimits Previously observed limit signatures.
 * @param incomingLimits Limits in the new full read.
 * @returns Whether at least one previous limit is absent.
 */
function hasRemovedLimit(
  previousLimits: Map<string, string>,
  incomingLimits: Map<string, string>
): boolean {
  for (const limitId of previousLimits.keys()) {
    if (!incomingLimits.has(limitId)) {
      return true;
    }
  }

  return false;
}
