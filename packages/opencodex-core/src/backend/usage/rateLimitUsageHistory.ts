import type { CachedUsageRateLimitSnapshot } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexUsageHistoryRateLimitPoint,
  OpenCodexUsageHistoryRateLimitSeries,
  OpenCodexUsageHistoryRateLimitWindow,
  OpenCodexUsageHistoryResolvedAggregation
} from "@open-codex-ui/opencodex-protocol";

import { compareHistoryEvents, readBucketSize } from "./usageHistoryBuckets.js";
import {
  readUsageHistoryRateLimits,
  type UsageHistoryRateLimit
} from "./usageHistoryMapping.js";

type RateLimitPointEvent = {
  observedAt: string;
  observedAtMs: number;
  id: number;
  point: OpenCodexUsageHistoryRateLimitPoint;
};

type RateLimitSeriesBuilder = {
  limitId: string | null;
  limitName: string | null;
  window: OpenCodexUsageHistoryRateLimitWindow;
  label: "5h" | "weekly" | "usage";
  points: RateLimitPointEvent[];
  bucketPoints: Map<number, RateLimitPointEvent>;
};

/**
 * Aggregates rate-limit snapshots into one series per limit/window.
 *
 * @param snapshots Persisted rate-limit snapshots.
 * @param aggregation Resolved aggregation.
 * @returns Rate-limit series.
 */
export function aggregateRateLimitSeries(
  snapshots: CachedUsageRateLimitSnapshot[],
  aggregation: OpenCodexUsageHistoryResolvedAggregation,
  fromMs: number
): OpenCodexUsageHistoryRateLimitSeries[] {
  const builders = new Map<string, RateLimitSeriesBuilder>();

  snapshots.forEach((snapshot) => {
    const observedAtMs = Date.parse(snapshot.observedAt);

    if (!Number.isFinite(observedAtMs)) {
      return;
    }

    const limits = readUsageHistoryRateLimits(snapshot);
    limits.forEach((limit) => {
      addRateLimitWindow(
        builders,
        snapshot,
        Math.max(observedAtMs, fromMs),
        limit,
        "primary",
        aggregation,
        fromMs
      );
      addRateLimitWindow(
        builders,
        snapshot,
        Math.max(observedAtMs, fromMs),
        limit,
        "secondary",
        aggregation,
        fromMs
      );
    });
  });

  return Array.from(builders.values())
    .map((builder) => ({
      limitId: builder.limitId,
      limitName: builder.limitName,
      window: builder.window,
      label: builder.label,
      points: (aggregation === "raw"
        ? builder.points
        : Array.from(builder.bucketPoints.values()))
        .sort(compareHistoryEvents)
        .map((event) => event.point)
    }))
    .sort(compareRateLimitSeries);
}

/**
 * Adds one rate-limit window observation to a series builder.
 *
 * @param builders Series builders keyed by limit and window.
 * @param snapshot Persisted snapshot.
 * @param observedAtMs Snapshot timestamp.
 * @param limit Mapped limit.
 * @param windowName Window name.
 * @param aggregation Resolved aggregation.
 * @returns Nothing.
 */
function addRateLimitWindow(
  builders: Map<string, RateLimitSeriesBuilder>,
  snapshot: CachedUsageRateLimitSnapshot,
  observedAtMs: number,
  limit: UsageHistoryRateLimit,
  windowName: OpenCodexUsageHistoryRateLimitWindow,
  aggregation: OpenCodexUsageHistoryResolvedAggregation,
  fromMs: number
): void {
  const window = limit[windowName];

  if (window === null) {
    return;
  }

  const key = `${limit.limitId ?? "__missing__"}:${windowName}`;
  const builder: RateLimitSeriesBuilder = builders.get(key) ?? {
    limitId: limit.limitId,
    limitName: limit.limitName,
    window: windowName,
    label: window.label,
    points: [],
    bucketPoints: new Map<number, RateLimitPointEvent>()
  };
  const effectiveObservedAt = new Date(observedAtMs).toISOString();
  const point = {
    observedAt: effectiveObservedAt,
    usedPercent: window.usedPercent,
    remainingPercent: window.remainingPercent
  };

  if (aggregation === "raw") {
    builder.points.push({
      observedAt: effectiveObservedAt,
      observedAtMs,
      id: snapshot.id ?? 0,
      point
    });
  } else {
    const bucketMs = Math.max(
      Math.floor(observedAtMs / readBucketSize(aggregation)) * readBucketSize(aggregation),
      fromMs
    );
    const bucketPoint = {
      observedAt: new Date(bucketMs).toISOString(),
      observedAtMs: bucketMs,
      id: snapshot.id ?? 0,
      point: { ...point, observedAt: new Date(bucketMs).toISOString() }
    };
    builder.bucketPoints.set(bucketMs, bucketPoint);
  }

  builders.set(key, builder);
}

/**
 * Sorts rate-limit series consistently for the UI.
 *
 * @param left First series.
 * @param right Second series.
 * @returns Sort comparison.
 */
function compareRateLimitSeries(
  left: OpenCodexUsageHistoryRateLimitSeries,
  right: OpenCodexUsageHistoryRateLimitSeries
): number {
  const leftId = left.limitId ?? "";
  const rightId = right.limitId ?? "";

  return leftId.localeCompare(rightId) || left.window.localeCompare(right.window);
}
