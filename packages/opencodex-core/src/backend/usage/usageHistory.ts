/**
 * Reads and aggregates source-scoped rate-limit and token usage history.
 */
import type {
  CachedSourceTokenUsageSnapshotQuery,
  CachedThreadTokenUsageSnapshot,
  CachedUsageRateLimitSnapshot,
  CachedUsageRateLimitSnapshotQuery,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { OpenCodexUsageHistory } from "@open-codex-ui/opencodex-protocol";

import { aggregateRateLimitSeries } from "./rateLimitUsageHistory.js";
import { aggregateTokenEvents, createTokenDeltaEvents } from "./tokenUsageHistory.js";
import {
  normalizeHistoryQuery,
  type NormalizedHistoryQuery,
  type UsageHistoryQuery
} from "./usageHistoryQuery.js";

const MAX_HISTORY_ROWS = 200_000;

export { normalizeHistoryQuery } from "./usageHistoryQuery.js";
export type { UsageHistoryQuery } from "./usageHistoryQuery.js";

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
