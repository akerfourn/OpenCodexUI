import type {
  OpenCodexUsageHistoryAggregation,
  OpenCodexUsageHistoryResolvedAggregation
} from "@open-codex-ui/opencodex-protocol";

import { DAY_MS } from "./usageHistoryBuckets.js";

export type UsageHistoryQuery = {
  sourceId: string;
  from: string;
  to: string;
  aggregation?: OpenCodexUsageHistoryAggregation;
};

export type NormalizedHistoryQuery = {
  sourceId: string;
  from: string;
  to: string;
  fromMs: number;
  toMs: number;
  aggregation: OpenCodexUsageHistoryResolvedAggregation;
};

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
