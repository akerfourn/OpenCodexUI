/**
 * Formats usage reset timestamps for display.
 */
import type { TFunction } from "i18next";

/**
 * Formats an absolute reset date with its relative counterpart.
 *
 * @param resetsAt ISO reset timestamp.
 * @param language Locale used for formatting.
 * @param t Translator for the relative duration wrapper.
 * @returns Display text, or `-` when unavailable.
 */
export function formatUsageReset(resetsAt: string | null, language: string, t: TFunction): string {
  const absoluteReset = formatUsageResetDate(resetsAt, language);

  if (absoluteReset === null) {
    return "-";
  }

  const relativeReset = formatUsageResetRelative(resetsAt, language, t);

  if (relativeReset === null) {
    return absoluteReset;
  }

  return `${absoluteReset} (${relativeReset})`;
}

/**
 * Formats an absolute reset timestamp.
 *
 * @param resetsAt ISO reset timestamp.
 * @param language Locale used for formatting.
 * @returns Localized timestamp, or `null` when unavailable.
 */
export function formatUsageResetDate(resetsAt: string | null, language: string): string | null {
  if (resetsAt === null) {
    return null;
  }

  const resetDate = new Date(resetsAt);

  if (Number.isNaN(resetDate.getTime())) {
    return null;
  }

  return resetDate.toLocaleString(language, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

/**
 * Formats a reset timestamp relative to now.
 *
 * @param resetsAt ISO reset timestamp.
 * @param language Locale used for formatting.
 * @param t Translator for the relative duration wrapper.
 * @returns Relative reset text, or `null` when unavailable.
 */
export function formatUsageResetRelative(resetsAt: string | null, language: string, t: TFunction): string | null {
  if (resetsAt === null) {
    return null;
  }

  const resetDate = new Date(resetsAt);

  if (Number.isNaN(resetDate.getTime())) {
    return null;
  }

  return formatRelativeReset(resetDate, language, t);
}

/**
 * Formats countdowns with minute precision below an hour and day/hour precision above a day.
 *
 * @param resetDate Reset date.
 * @param language Locale used for formatting.
 * @param t Translator for the relative duration wrapper.
 * @returns Relative reset text.
 */
function formatRelativeReset(resetDate: Date, language: string, t: TFunction): string {
  const diffMs = resetDate.getTime() - Date.now();
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "always" });

  if (diffMs <= 0) {
    return formatter.format(0, "minute");
  }

  const diffMinutes = Math.ceil(diffMs / 60_000);

  if (diffMinutes < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.ceil(diffMinutes / 60);

  if (diffHours < 24) {
    return formatter.format(diffHours, "hour");
  }

  const days = Math.floor(diffHours / 24);
  const hours = diffHours % 24;
  const parts = [new Intl.NumberFormat(language, {
    style: "unit", unit: "day", unitDisplay: "long"
  }).format(days)];
  if (hours !== 0) {
    parts.push(new Intl.NumberFormat(language, {
      style: "unit", unit: "hour", unitDisplay: "long"
    }).format(hours));
  }
  const duration = new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(parts);
  return t("usage.remainingDuration", { duration });
}
