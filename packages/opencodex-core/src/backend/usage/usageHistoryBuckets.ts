import type { OpenCodexUsageHistoryResolvedAggregation } from "@open-codex-ui/opencodex-protocol";

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Reads the duration of a concrete aggregation bucket.
 *
 * @param aggregation Resolved aggregation.
 * @returns Bucket duration in milliseconds.
 */
export function readBucketSize(
  aggregation: OpenCodexUsageHistoryResolvedAggregation
): number {
  if (aggregation === "minute") {
    return 60 * 1000;
  }

  if (aggregation === "hour") {
    return HOUR_MS;
  }

  return DAY_MS;
}

/**
 * Sorts timestamped history events.
 *
 * @param left First event.
 * @param right Second event.
 * @returns Sort comparison.
 */
export function compareHistoryEvents(
  left: { observedAtMs: number; id: number },
  right: { observedAtMs: number; id: number }
): number {
  return left.observedAtMs - right.observedAtMs || left.id - right.id;
}
