/**
 * Reads and aggregates source-scoped rate-limit and token usage history.
 */
import type {
  CachedSourceTokenUsageSnapshotQuery,
  CachedThreadTokenUsageBreakdown,
  CachedThreadTokenUsageSnapshot,
  CachedUsageRateLimitSnapshot,
  CachedUsageRateLimitSnapshotQuery,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexThreadTokenUsageBreakdown,
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryAggregation,
  OpenCodexUsageHistoryRateLimitPoint,
  OpenCodexUsageHistoryRateLimitSeries,
  OpenCodexUsageHistoryRateLimitWindow,
  OpenCodexUsageHistoryResolvedAggregation,
  OpenCodexUsageHistoryTokenPoint
} from "@open-codex-ui/opencodex-protocol";

import { readUsageHistoryRateLimits, type UsageHistoryRateLimit } from "./usageHistoryMapping.js";

const MAX_HISTORY_ROWS = 200_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type UsageHistoryQuery = {
  sourceId: string;
  from: string;
  to: string;
  aggregation?: OpenCodexUsageHistoryAggregation;
};

type NormalizedHistoryQuery = {
  sourceId: string;
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
  aggregation: OpenCodexUsageHistoryResolvedAggregation;
};

type TokenDeltaEvent = {
  observedAt: string;
  observedAtMs: number;
  id: number;
  instant: OpenCodexThreadTokenUsageBreakdown;
  isPartial: boolean;
};

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
 * Reads and aggregates usage history from the cache.
 *
 * @param repository Cache repository, or `null` when SQLite is unavailable.
 * @param query Source and time-range query.
 * @returns Chart-ready usage history.
 */
export async function readUsageHistory(
  repository: OpenCodexCacheRepository | null,
  query: UsageHistoryQuery
): Promise<OpenCodexUsageHistory> {
  const normalizedQuery = normalizeHistoryQuery(query);

  if (repository === null) {
    return createEmptyUsageHistory(normalizedQuery);
  }

  const rateLimitQuery: CachedUsageRateLimitSnapshotQuery = {
    sourceId: normalizedQuery.sourceId,
    fromObservedAt: normalizedQuery.from,
    toObservedAt: normalizedQuery.to,
    includeBaselineBeforeFrom: true,
    limit: MAX_HISTORY_ROWS
  };
  const tokenQuery: CachedSourceTokenUsageSnapshotQuery = {
    sourceId: normalizedQuery.sourceId,
    fromObservedAt: normalizedQuery.from,
    toObservedAt: normalizedQuery.to,
    limit: MAX_HISTORY_ROWS
  };
  const [rateLimitSnapshots, tokenSnapshots] = await Promise.all([
    repository.listUsageRateLimitSnapshots(rateLimitQuery),
    repository.listSourceTokenUsageSnapshots(tokenQuery)
  ]);

  return buildUsageHistory(normalizedQuery, rateLimitSnapshots, tokenSnapshots);
}

/**
 * Builds chart data from persisted snapshots.
 *
 * @param query Normalized history query.
 * @param rateLimitSnapshots Persisted rate-limit snapshots.
 * @param tokenSnapshots Baselines and in-range token snapshots.
 * @returns Chart-ready usage history.
 */
export function buildUsageHistory(
  query: NormalizedHistoryQuery,
  rateLimitSnapshots: CachedUsageRateLimitSnapshot[],
  tokenSnapshots: CachedThreadTokenUsageSnapshot[]
): OpenCodexUsageHistory {
  const tokenEvents = createTokenDeltaEvents(query, tokenSnapshots);
  const tokenResult = aggregateTokenEvents(tokenEvents, query.aggregation, query.fromMs);

  return {
    sourceId: query.sourceId,
    from: query.from,
    to: query.to,
    aggregation: query.aggregation,
    rateLimits: aggregateRateLimitSeries(
      rateLimitSnapshots,
      query.aggregation,
      query.fromMs
    ),
    tokens: tokenResult.points,
    hasPartialTokenData: tokenResult.hasPartialData
  };
}

/**
 * Validates and normalizes a public history query.
 *
 * @param query Public history query.
 * @returns Normalized query.
 */
export function normalizeHistoryQuery(query: UsageHistoryQuery): NormalizedHistoryQuery {
  const sourceId = query.sourceId.trim();

  if (sourceId.length === 0) {
    throw new Error("A source is required to read usage history.");
  }

  const fromMs = Date.parse(query.from);
  const toMs = Date.parse(query.to);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error("Usage history dates must be valid ISO timestamps.");
  }

  if (toMs <= fromMs) {
    throw new Error("Usage history end date must be after its start date.");
  }

  return {
    sourceId,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    fromMs,
    toMs,
    aggregation: resolveAggregation(query.aggregation ?? "auto", toMs - fromMs)
  };
}

/**
 * Resolves automatic granularity from the requested period length.
 *
 * @param aggregation Requested aggregation.
 * @param durationMs Duration in milliseconds.
 * @returns Concrete aggregation.
 */
function resolveAggregation(
  aggregation: OpenCodexUsageHistoryAggregation,
  durationMs: number
): OpenCodexUsageHistoryResolvedAggregation {
  if (aggregation !== "auto") {
    if (aggregation === "raw" || aggregation === "minute" || aggregation === "hour" || aggregation === "day") {
      return aggregation;
    }

    throw new Error(`Unsupported usage history aggregation: ${aggregation}`);
  }

  if (durationMs <= DAY_MS) {
    return "raw";
  }

  if (durationMs <= 7 * DAY_MS) {
    return "minute";
  }

  if (durationMs <= 90 * DAY_MS) {
    return "hour";
  }

  return "day";
}

/**
 * Converts token snapshots into positive counter deltas per thread.
 *
 * @param query Normalized history query.
 * @param snapshots Baselines and in-range snapshots.
 * @returns Token delta events in chronological order.
 */
function createTokenDeltaEvents(
  query: NormalizedHistoryQuery,
  snapshots: CachedThreadTokenUsageSnapshot[]
): TokenDeltaEvent[] {
  const previousByThreadId = new Map<string, CachedThreadTokenUsageBreakdown>();
  const events: TokenDeltaEvent[] = [];

  snapshots.forEach((snapshot) => {
    const observedAtMs = Date.parse(snapshot.observedAt);

    if (!Number.isFinite(observedAtMs)) {
      return;
    }

    if (observedAtMs < query.fromMs) {
      previousByThreadId.set(snapshot.threadId, snapshot.total);
      return;
    }

    const previous = previousByThreadId.get(snapshot.threadId);
    const delta = subtractTokenBreakdown(snapshot.total, previous);

    previousByThreadId.set(snapshot.threadId, snapshot.total);
    events.push({
      observedAt: snapshot.observedAt,
      observedAtMs,
      id: snapshot.id ?? 0,
      instant: delta.breakdown,
      isPartial: delta.isPartial
    });
  });

  return events.sort(compareHistoryEvents);
}

/**
 * Computes one non-negative counter delta, marking missing or reset baselines.
 *
 * @param current Current cumulative counters.
 * @param previous Previous counters, or `undefined` when no baseline exists.
 * @returns Delta and partial-data marker.
 */
function subtractTokenBreakdown(
  current: CachedThreadTokenUsageBreakdown,
  previous: CachedThreadTokenUsageBreakdown | undefined
): { breakdown: OpenCodexThreadTokenUsageBreakdown; isPartial: boolean } {
  if (previous === undefined) {
    return { breakdown: cloneBreakdown(current), isPartial: true };
  }

  const rawDelta = {
    totalTokens: current.totalTokens - previous.totalTokens,
    inputTokens: current.inputTokens - previous.inputTokens,
    cachedInputTokens: current.cachedInputTokens - previous.cachedInputTokens,
    outputTokens: current.outputTokens - previous.outputTokens,
    reasoningOutputTokens: current.reasoningOutputTokens - previous.reasoningOutputTokens
  };
  const hasCounterReset = Object.values(rawDelta).some((value) => value < 0);

  return {
    breakdown: hasCounterReset ? cloneBreakdown(current) : rawDelta,
    isPartial: hasCounterReset
  };
}

/**
 * Aggregates token deltas and calculates the cumulative series.
 *
 * @param events Token delta events.
 * @param aggregation Resolved aggregation.
 * @returns Token points and partial-data marker.
 */
function aggregateTokenEvents(
  events: TokenDeltaEvent[],
  aggregation: OpenCodexUsageHistoryResolvedAggregation,
  fromMs: number
): { points: OpenCodexUsageHistoryTokenPoint[]; hasPartialData: boolean } {
  const grouped = aggregation === "raw"
    ? events
    : groupTokenEvents(events, aggregation, fromMs);
  const cumulative = createEmptyBreakdown();
  let hasPartialData = false;
  const points = grouped.map((event) => {
    addBreakdown(cumulative, event.instant);
    hasPartialData = hasPartialData || event.isPartial;

    return {
      observedAt: event.observedAt,
      instant: event.instant,
      cumulative: cloneBreakdown(cumulative),
      isPartial: event.isPartial
    };
  });

  return { points, hasPartialData };
}

/**
 * Groups token deltas into minute, hour, or day buckets.
 *
 * @param events Token delta events.
 * @param aggregation Resolved aggregation.
 * @returns One event per bucket.
 */
function groupTokenEvents(
  events: TokenDeltaEvent[],
  aggregation: OpenCodexUsageHistoryResolvedAggregation,
  fromMs: number
): TokenDeltaEvent[] {
  const bucketSizeMs = readBucketSize(aggregation);
  const buckets = new Map<number, TokenDeltaEvent>();

  events.forEach((event) => {
    const bucketMs = Math.max(
      Math.floor(event.observedAtMs / bucketSizeMs) * bucketSizeMs,
      fromMs
    );
    const bucket = buckets.get(bucketMs);

    if (bucket === undefined) {
      buckets.set(bucketMs, {
        observedAt: new Date(bucketMs).toISOString(),
        observedAtMs: bucketMs,
        id: event.id,
        instant: cloneBreakdown(event.instant),
        isPartial: event.isPartial
      });
      return;
    }

    addBreakdown(bucket.instant, event.instant);
    bucket.isPartial = bucket.isPartial || event.isPartial;
  });

  return Array.from(buckets.values()).sort(compareHistoryEvents);
}

/**
 * Aggregates rate-limit snapshots into one series per limit/window.
 *
 * @param snapshots Persisted rate-limit snapshots.
 * @param aggregation Resolved aggregation.
 * @returns Rate-limit series.
 */
function aggregateRateLimitSeries(
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
 * Creates an empty result when SQLite is unavailable.
 *
 * @param query Normalized query.
 * @returns Empty history result.
 */
function createEmptyUsageHistory(query: NormalizedHistoryQuery): OpenCodexUsageHistory {
  return {
    sourceId: query.sourceId,
    from: query.from,
    to: query.to,
    aggregation: query.aggregation,
    rateLimits: [],
    tokens: [],
    hasPartialTokenData: false
  };
}

/**
 * Reads the duration of a concrete aggregation bucket.
 *
 * @param aggregation Resolved aggregation.
 * @returns Bucket duration in milliseconds.
 */
function readBucketSize(aggregation: OpenCodexUsageHistoryResolvedAggregation): number {
  if (aggregation === "minute") {
    return 60 * 1000;
  }

  if (aggregation === "hour") {
    return HOUR_MS;
  }

  return DAY_MS;
}

/**
 * Creates a zeroed token breakdown.
 *
 * @returns Empty token breakdown.
 */
function createEmptyBreakdown(): OpenCodexThreadTokenUsageBreakdown {
  return {
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };
}

/**
 * Copies a token breakdown into a plain object.
 *
 * @param breakdown Breakdown to copy.
 * @returns Copied breakdown.
 */
function cloneBreakdown(
  breakdown: CachedThreadTokenUsageBreakdown | OpenCodexThreadTokenUsageBreakdown
): OpenCodexThreadTokenUsageBreakdown {
  return {
    totalTokens: breakdown.totalTokens,
    inputTokens: breakdown.inputTokens,
    cachedInputTokens: breakdown.cachedInputTokens,
    outputTokens: breakdown.outputTokens,
    reasoningOutputTokens: breakdown.reasoningOutputTokens
  };
}

/**
 * Adds one token breakdown into another.
 *
 * @param target Accumulator.
 * @param value Breakdown to add.
 * @returns Nothing.
 */
function addBreakdown(
  target: OpenCodexThreadTokenUsageBreakdown,
  value: OpenCodexThreadTokenUsageBreakdown
): void {
  target.totalTokens += value.totalTokens;
  target.inputTokens += value.inputTokens;
  target.cachedInputTokens += value.cachedInputTokens;
  target.outputTokens += value.outputTokens;
  target.reasoningOutputTokens += value.reasoningOutputTokens;
}

/**
 * Sorts timestamped history events.
 *
 * @param left First event.
 * @param right Second event.
 * @returns Sort comparison.
 */
function compareHistoryEvents(
  left: { observedAtMs: number; id: number },
  right: { observedAtMs: number; id: number }
): number {
  return left.observedAtMs - right.observedAtMs || left.id - right.id;
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
