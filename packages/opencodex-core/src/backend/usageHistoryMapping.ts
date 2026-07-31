/**
 * Reads normalized rate-limit data retained in usage history payloads.
 */
import type { CachedUsageRateLimitSnapshot } from "@open-codex-ui/opencodex-cache";

import { readNullableNumber, readObject, readString } from "../mapping.js";

export type UsageHistoryRateLimitWindow = {
  label: "5h" | "weekly" | "usage";
  usedPercent: number;
  remainingPercent: number;
};

export type UsageHistoryRateLimit = {
  limitId: string | null;
  limitName: string | null;
  primary: UsageHistoryRateLimitWindow | null;
  secondary: UsageHistoryRateLimitWindow | null;
};

/**
 * Reads the normalized rate limits from one persisted JSON envelope.
 *
 * @param snapshot Persisted rate-limit history snapshot.
 * @returns Normalized limits, or an empty list for invalid/old payloads.
 */
export function readUsageHistoryRateLimits(
  snapshot: CachedUsageRateLimitSnapshot
): UsageHistoryRateLimit[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(snapshot.payloadJson) as unknown;
  } catch {
    return [];
  }

  const mapped = readObject(readObject(parsed).mapped);

  if (!Array.isArray(mapped.limits)) {
    return [];
  }

  return mapped.limits
    .map((value) => mapUsageHistoryRateLimit(value))
    .filter((limit): limit is UsageHistoryRateLimit => limit !== null);
}

/**
 * Maps one serialized normalized rate-limit entry.
 *
 * @param value Serialized limit value.
 * @returns Mapped limit, or `null` when it contains no usable window.
 */
function mapUsageHistoryRateLimit(value: unknown): UsageHistoryRateLimit | null {
  const limit = readObject(value);
  const mapped: UsageHistoryRateLimit = {
    limitId: readNullableText(limit.limitId),
    limitName: readNullableText(limit.limitName),
    primary: mapUsageHistoryRateLimitWindow(limit.primary),
    secondary: mapUsageHistoryRateLimitWindow(limit.secondary)
  };

  return mapped.primary === null && mapped.secondary === null ? null : mapped;
}

/**
 * Maps one serialized rate-limit window.
 *
 * @param value Serialized window value.
 * @returns Mapped window, or `null` when the percentage is absent.
 */
function mapUsageHistoryRateLimitWindow(value: unknown): UsageHistoryRateLimitWindow | null {
  const window = readObject(value);
  const usedPercent = readNullableNumber(window.usedPercent);
  const remainingPercent = readNullableNumber(window.remainingPercent);

  if (usedPercent === null || remainingPercent === null) {
    return null;
  }

  return {
    label: readWindowLabel(window.label),
    usedPercent: clampPercent(usedPercent),
    remainingPercent: clampPercent(remainingPercent)
  };
}

/**
 * Reads a known history window label without trusting serialized data.
 *
 * @param value Serialized label.
 * @returns Known label, or the generic usage label.
 */
function readWindowLabel(value: unknown): UsageHistoryRateLimitWindow["label"] {
  const label = readString(value);

  if (label === "5h" || label === "weekly" || label === "usage") {
    return label;
  }

  return "usage";
}

/**
 * Reads optional non-empty text from serialized data.
 *
 * @param value Serialized value.
 * @returns Text, or `null`.
 */
function readNullableText(value: unknown): string | null {
  const text = readString(value);
  return text.length === 0 ? null : text;
}

/**
 * Clamps a serialized percentage to the chart-safe range.
 *
 * @param value Percentage value.
 * @returns Percentage between zero and one hundred.
 */
function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}
