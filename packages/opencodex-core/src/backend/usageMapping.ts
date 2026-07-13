/**
 * Maps Codex account rate-limit payloads to OpenCodex usage models.
 */
import type {
  OpenCodexUsageLimits,
  OpenCodexUsageResetCredit,
  OpenCodexUsageResetCredits,
  OpenCodexUsageSnapshot,
  OpenCodexUsageWindow
} from "@open-codex-ui/opencodex-protocol";

import { readNullableNumber, readObject, readString } from "../mapping.js";

/**
 * Reads the preferred usage snapshot from an account rate-limit response.
 *
 * @param response Codex response or notification params.
 * @param sourceId Source identifier owning the account payload.
 * @returns Mapped usage limits, or `null` when unavailable.
 */
export function mapUsageLimitsResponse(
  response: unknown,
  sourceId: string
): OpenCodexUsageSnapshot | null {
  const root = readObject(response);
  const byLimitId = readObject(root.rateLimitsByLimitId);
  const fallbackLimits = readObject(root.rateLimits);
  const rateLimitResetCredits = mapUsageResetCredits(root.rateLimitResetCredits);
  const limits = Object.entries(byLimitId)
    .map(([limitId, value]) => mapUsageLimits(value, limitId))
    .filter((usage): usage is OpenCodexUsageLimits => usage !== null);

  if (limits.length === 0) {
    const fallback = mapUsageLimits(fallbackLimits);

    if (fallback === null && rateLimitResetCredits === null) {
      return null;
    }

    if (fallback !== null) {
      limits.push(fallback);
    }
  }

  return {
    sourceId,
    limits,
    rateLimitResetCredits,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Reads the usage snapshot from an account rate-limit notification.
 *
 * @param params Notification params.
 * @param sourceId Source identifier owning the notification.
 * @returns Mapped usage limits, or `null` when unavailable.
 */
export function mapUsageLimitsNotification(
  params: unknown,
  sourceId: string
): OpenCodexUsageSnapshot | null {
  const usage = mapUsageLimits(readObject(params).rateLimits);

  if (usage === null || usage.limitId === null) {
    return null;
  }

  return {
    sourceId,
    limits: [usage],
    updatedAt: new Date().toISOString()
  };
}

/**
 * Maps the optional banked reset summary from a rate-limit response.
 *
 * @param value Raw reset summary.
 * @returns Reset summary, or `null` when Codex did not provide it.
 */
function mapUsageResetCredits(value: unknown): OpenCodexUsageResetCredits | null {
  const summary = readObject(value);

  if (Object.keys(summary).length === 0) {
    return null;
  }

  const availableCount = readResetCreditCount(summary.availableCount);

  if (availableCount === null) {
    return null;
  }

  return {
    availableCount,
    credits: Array.isArray(summary.credits)
      ? summary.credits
        .map((credit) => mapUsageResetCredit(credit))
        .filter((credit): credit is OpenCodexUsageResetCredit => credit !== null)
      : null
  };
}

/**
 * Maps one banked reset detail row.
 *
 * @param value Raw reset detail.
 * @returns Reset detail, or `null` when its identifier is missing.
 */
function mapUsageResetCredit(value: unknown): OpenCodexUsageResetCredit | null {
  const credit = readObject(value);
  const id = readString(credit.id);

  if (id.length === 0) {
    return null;
  }

  return {
    id,
    resetType: readString(credit.resetType) || "unknown",
    status: readResetCreditStatus(credit.status),
    grantedAt: mapUnixTimestamp(credit.grantedAt),
    expiresAt: mapUnixTimestamp(credit.expiresAt),
    title: readNullableString(credit.title),
    description: readNullableString(credit.description)
  };
}

/**
 * Reads a reset count from JSON numbers or generated bigint values.
 *
 * @param value Raw count.
 * @returns Safe numeric count, or `null` when invalid.
 */
function readResetCreditCount(value: unknown): number | null {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }

    return Number(value);
  }

  const count = readNullableNumber(value);

  if (count === null || !Number.isSafeInteger(count) || count < 0) {
    return null;
  }

  return count;
}

/**
 * Maps a Unix timestamp to the protocol ISO representation.
 *
 * @param value Raw timestamp in seconds.
 * @returns ISO timestamp, or `null` when absent or invalid.
 */
function mapUnixTimestamp(value: unknown): string | null {
  const timestamp = readNullableNumber(value);

  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp * 1000);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Maps an unknown reset status without losing forward compatibility.
 *
 * @param value Raw reset status.
 * @returns Known status or `unknown`.
 */
function readResetCreditStatus(value: unknown): OpenCodexUsageResetCredit["status"] {
  const status = readString(value);

  if (status === "available" || status === "redeeming" || status === "redeemed") {
    return status;
  }

  return "unknown";
}

/**
 * Maps one Codex rate-limit object into a protocol usage limit.
 *
 * @param value Raw rate-limit payload.
 * @returns Usage limit, or `null` when the payload is empty.
 */
function mapUsageLimits(value: unknown, fallbackLimitId: string | null = null): OpenCodexUsageLimits | null {
  const limits = readObject(value);

  if (Object.keys(limits).length === 0) {
    return null;
  }

  return {
    limitId: readNullableString(limits.limitId) ?? fallbackLimitId,
    limitName: readNullableString(limits.limitName),
    planType: readNullableString(limits.planType),
    primary: mapUsageWindow(limits.primary),
    secondary: mapUsageWindow(limits.secondary),
    credits: mapCredits(limits.credits)
  };
}

/**
 * Maps one usage window from a Codex rate-limit payload.
 *
 * @param value Raw usage window payload.
 * @returns Usage window, or `null` when no percentage is available.
 */
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

/**
 * Maps optional account credit information.
 *
 * @param value Raw credits payload.
 * @returns Credit metadata, or `null` when absent.
 */
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

/**
 * Derives a compact usage window label from its duration.
 *
 * @param durationMins Window duration in minutes.
 * @returns Display label used by the UI.
 */
function readWindowLabel(durationMins: number | null): OpenCodexUsageWindow["label"] {
  if (durationMins !== null && durationMins <= 6 * 60) {
    return "5h";
  }

  if (durationMins !== null && durationMins >= 6 * 24 * 60) {
    return "weekly";
  }

  return "usage";
}

/**
 * Clamps a percentage to the UI-safe range.
 *
 * @param value Raw percentage.
 * @returns Percentage between 0 and 100.
 */
function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Reads optional non-empty text from an unknown payload value.
 *
 * @param value Raw value.
 * @returns Text, or `null` when blank.
 */
function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text.length === 0 ? null : text;
}
