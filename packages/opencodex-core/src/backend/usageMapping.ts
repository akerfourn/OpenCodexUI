/**
 * Maps Codex account rate-limit payloads to OpenCodex usage models.
 */
import type { OpenCodexUsageLimits, OpenCodexUsageWindow } from "@open-codex-ui/opencodex-protocol";

import { readNullableNumber, readObject, readString } from "../mapping.js";

/**
 * Reads the preferred usage snapshot from an account rate-limit response.
 *
 * @param response Codex response or notification params.
 * @returns Mapped usage limits, or `null` when unavailable.
 */
export function mapUsageLimitsResponse(response: unknown): OpenCodexUsageLimits | null {
  const root = readObject(response);
  const byLimitId = readObject(root.rateLimitsByLimitId);
  const codexLimits = readObject(byLimitId.codex);
  const fallbackLimits = readObject(root.rateLimits);
  const limits = Object.keys(codexLimits).length > 0 ? codexLimits : fallbackLimits;

  return mapUsageLimits(limits);
}

/**
 * Reads the usage snapshot from an account rate-limit notification.
 *
 * @param params Notification params.
 * @returns Mapped usage limits, or `null` when unavailable.
 */
export function mapUsageLimitsNotification(params: unknown): OpenCodexUsageLimits | null {
  return mapUsageLimits(readObject(params).rateLimits);
}

function mapUsageLimits(value: unknown): OpenCodexUsageLimits | null {
  const limits = readObject(value);

  if (Object.keys(limits).length === 0) {
    return null;
  }

  return {
    limitId: readNullableString(limits.limitId),
    limitName: readNullableString(limits.limitName),
    planType: readNullableString(limits.planType),
    primary: mapUsageWindow(limits.primary),
    secondary: mapUsageWindow(limits.secondary),
    credits: mapCredits(limits.credits)
  };
}

function mapUsageWindow(value: unknown): OpenCodexUsageWindow | null {
  const window = readObject(value);
  const usedPercent = readNullableNumber(window.usedPercent);

  if (usedPercent === null) {
    return null;
  }

  const durationMins = readNullableNumber(window.windowDurationMins);
  const resetsAt = readNullableNumber(window.resetsAt);

  return {
    label: readWindowLabel(durationMins),
    usedPercent: clampPercent(usedPercent),
    remainingPercent: clampPercent(100 - usedPercent),
    windowDurationMins: durationMins,
    resetsAt: resetsAt === null ? null : new Date(resetsAt * 1000).toISOString()
  };
}

function mapCredits(value: unknown): OpenCodexUsageLimits["credits"] {
  const credits = readObject(value);

  if (Object.keys(credits).length === 0) {
    return null;
  }

  return {
    hasCredits: credits.hasCredits === true,
    unlimited: credits.unlimited === true,
    balance: readNullableString(credits.balance)
  };
}

function readWindowLabel(durationMins: number | null): OpenCodexUsageWindow["label"] {
  if (durationMins !== null && durationMins <= 6 * 60) {
    return "5h";
  }

  if (durationMins !== null && durationMins >= 6 * 24 * 60) {
    return "weekly";
  }

  return "usage";
}

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text.length === 0 ? null : text;
}
