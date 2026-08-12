/**
 * Token usage numbers for a single usage bucket.
 */
export type CachedThreadTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

/**
 * Latest known token usage snapshot for a cached thread.
 */
export type CachedThreadTokenUsage = {
  threadId: string;
  turnId: string;
  total: CachedThreadTokenUsageBreakdown;
  last: CachedThreadTokenUsageBreakdown;
  contextWindowTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

/**
 * Immutable token usage snapshot received for one source/thread/turn.
 */
export type CachedThreadTokenUsageSnapshot = {
  id?: number;
  sourceId: string;
  threadId: string;
  turnId: string;
  observedAt: string;
  total: CachedThreadTokenUsageBreakdown;
  last: CachedThreadTokenUsageBreakdown;
  modelContextWindow: number | null;
  model: string | null;
  reasoningEffort: string | null;
  serviceTier: string | null;
};

/**
 * Query for historical token usage snapshots.
 */
export type CachedThreadTokenUsageSnapshotQuery = {
  sourceId: string;
  threadId: string;
  turnId?: string | null;
  limit?: number | null;
};

/**
 * Query for token usage snapshots across every thread of one source.
 *
 * The repository includes the latest snapshot before the period for each
 * thread so callers can calculate deltas without counting older usage again.
 */
export type CachedSourceTokenUsageSnapshotQuery = {
  sourceId: string;
  fromObservedAt: string;
  toObservedAt: string;
  limit?: number | null;
};

/**
 * Origin of a persisted Codex rate-limit snapshot.
 */
export type CachedUsageRateLimitSnapshotOrigin = "read" | "notification";

/**
 * Immutable source-scoped rate-limit snapshot.
 *
 * The payload is intentionally kept as JSON so new Codex fields can be
 * retained without requiring a cache schema change.
 */
export type CachedUsageRateLimitSnapshot = {
  id?: number;
  sourceId: string;
  observedAt: string;
  origin: CachedUsageRateLimitSnapshotOrigin;
  reason: string;
  fingerprint: string;
  payloadJson: string;
};

/**
 * Query for historical source-scoped rate-limit snapshots.
 */
export type CachedUsageRateLimitSnapshotQuery = {
  sourceId: string;
  fromObservedAt?: string | null;
  toObservedAt?: string | null;
  includeBaselineBeforeFrom?: boolean;
  limit?: number | null;
};

/**
 * Execution settings embedded temporarily in a cached raw turn.
 */
export type CachedTurnExecutionSettings = {
  requestedModel: string | null;
  effectiveModel: string | null;
  requestedReasoningEffort: string | null;
  effectiveReasoningEffort: string | null;
  serviceTier: string | null;
};

/**
 * Persisted execution metadata associated with one turn.
 */
export type CachedTurnExecutionMetadata = {
  sourceId: string;
  threadId: string;
  turnId: string;
  requestedModel: string | null;
  effectiveModel: string | null;
  requestedReasoningEffort: string | null;
  effectiveReasoningEffort: string | null;
  serviceTier: string | null;
  firstObservedAt: string;
  updatedAt: string;
};

/**
 * Aggregated token usage for the cached user-facing chats of one project.
 */
export type CachedProjectTokenUsageStatistics = {
  chatCount: number;
  chatsWithTokenUsage: number;
  chatsWithoutTokenUsage: number;
  tokenUsage: CachedThreadTokenUsageBreakdown;
};
