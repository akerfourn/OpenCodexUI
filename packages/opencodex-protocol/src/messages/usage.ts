/**
 * One quota window reported by Codex account usage.
 */
export type OpenCodexUsageWindow = {
  label: "5h" | "weekly" | "usage";
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: string | null;
};

/**
 * Optional credit metadata returned with account usage.
 */
export type OpenCodexUsageCredits = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

/**
 * Status of one banked rate-limit reset credit.
 */
export type OpenCodexUsageResetCreditStatus =
  | "available"
  | "redeeming"
  | "redeemed"
  | "unknown";

/**
 * One banked rate-limit reset credit returned by Codex.
 */
export type OpenCodexUsageResetCredit = {
  id: string;
  resetType: string;
  status: OpenCodexUsageResetCreditStatus;
  grantedAt: string | null;
  expiresAt: string | null;
  title: string | null;
  description: string | null;
};

/**
 * Summary of banked rate-limit resets for one Codex account.
 */
export type OpenCodexUsageResetCredits = {
  availableCount: number;
  credits: OpenCodexUsageResetCredit[] | null;
};

/**
 * Result returned after attempting to consume one banked reset credit.
 */
export type OpenCodexUsageResetConsumeResult = {
  outcome: "reset" | "nothingToReset" | "noCredit" | "alreadyRedeemed";
};

/**
 * Usage limits for one Codex account limit id.
 */
export type OpenCodexUsageLimits = {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: OpenCodexUsageWindow | null;
  secondary: OpenCodexUsageWindow | null;
  credits: OpenCodexUsageCredits | null;
};

/**
 * Usage snapshot emitted to the UI.
 */
export type OpenCodexUsageSnapshot = {
  sourceId: string;
  limits: OpenCodexUsageLimits[];
  /** Omitted by sparse rate-limit notifications, which do not contain reset data. */
  rateLimitResetCredits?: OpenCodexUsageResetCredits | null;
  updatedAt: string;
};

/**
 * Requested resolution for usage history charts.
 */
export type OpenCodexUsageHistoryAggregation = "auto" | "raw" | "minute" | "hour" | "day";

/**
 * Resolved history resolution returned by the backend.
 */
export type OpenCodexUsageHistoryResolvedAggregation = Exclude<
  OpenCodexUsageHistoryAggregation,
  "auto"
>;

/**
 * One rate-limit window represented in usage history.
 */
export type OpenCodexUsageHistoryRateLimitWindow = "primary" | "secondary";

/**
 * One point in a rate-limit history series.
 */
export type OpenCodexUsageHistoryRateLimitPoint = {
  observedAt: string;
  usedPercent: number;
  remainingPercent: number;
};

/**
 * History series for one source rate-limit window.
 */
export type OpenCodexUsageHistoryRateLimitSeries = {
  limitId: string | null;
  limitName: string | null;
  window: OpenCodexUsageHistoryRateLimitWindow;
  label: OpenCodexUsageWindow["label"];
  points: OpenCodexUsageHistoryRateLimitPoint[];
};

/**
 * Token counts grouped by category.
 */
export type OpenCodexThreadTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

/**
 * Context-window usage for one thread/turn.
 */
export type OpenCodexThreadTokenUsage = {
  threadId: string;
  turnId: string;
  total: OpenCodexThreadTokenUsageBreakdown;
  last: OpenCodexThreadTokenUsageBreakdown;
  contextWindowTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

/**
 * One point in source-wide token usage history.
 *
 * `instant` is the increase in the thread cumulative counters since the
 * previous observed snapshot. `cumulative` starts at zero for the requested
 * period.
 */
export type OpenCodexUsageHistoryTokenPoint = {
  observedAt: string;
  instant: OpenCodexThreadTokenUsageBreakdown;
  cumulative: OpenCodexThreadTokenUsageBreakdown;
  isPartial: boolean;
};

/**
 * Source-wide usage history returned for chart rendering.
 */
export type OpenCodexUsageHistory = {
  sourceId: string;
  from: string;
  to: string;
  aggregation: OpenCodexUsageHistoryResolvedAggregation;
  rateLimits: OpenCodexUsageHistoryRateLimitSeries[];
  tokens: OpenCodexUsageHistoryTokenPoint[];
  hasPartialTokenData: boolean;
};

/**
 * Aggregated statistics for the user-facing chats of one project.
 */
export type OpenCodexProjectStatistics = {
  chatCount: number;
  chatsWithTokenUsage: number;
  chatsWithoutTokenUsage: number;
  tokenUsage: OpenCodexThreadTokenUsageBreakdown;
};
