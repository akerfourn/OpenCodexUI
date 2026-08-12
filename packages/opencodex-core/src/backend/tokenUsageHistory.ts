import type {
  CachedThreadTokenUsageBreakdown,
  CachedThreadTokenUsageSnapshot
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexThreadTokenUsageBreakdown,
  OpenCodexUsageHistoryResolvedAggregation,
  OpenCodexUsageHistoryTokenPoint
} from "@open-codex-ui/opencodex-protocol";

import { compareHistoryEvents, readBucketSize } from "./usageHistoryBuckets.js";
import type { NormalizedHistoryQuery } from "./usageHistoryQuery.js";

type TokenDeltaEvent = {
  observedAt: string;
  observedAtMs: number;
  id: number;
  instant: OpenCodexThreadTokenUsageBreakdown;
  isPartial: boolean;
};

/**
 * Converts token snapshots into positive counter deltas per thread.
 *
 * @param query Normalized history query.
 * @param snapshots Baselines and in-range snapshots.
 * @returns Token delta events in chronological order.
 */
export function createTokenDeltaEvents(
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
export function aggregateTokenEvents(
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

/** Creates a zeroed token breakdown. */
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
