/**
 * Formats usage reset timestamps for display.
 */

/**
 * Formats an absolute reset date with its relative counterpart.
 *
 * @param resetsAt ISO reset timestamp.
 * @param language Locale used for formatting.
 * @returns Display text, or `-` when unavailable.
 */
export function formatUsageReset(resetsAt: string | null, language: string): string {
  const absoluteReset = formatUsageResetDate(resetsAt, language);

  if (absoluteReset === null) {
    return "-";
  }

  const relativeReset = formatUsageResetRelative(resetsAt, language);

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
 * @returns Relative reset text, or `null` when unavailable.
 */
export function formatUsageResetRelative(resetsAt: string | null, language: string): string | null {
  if (resetsAt === null) {
    return null;
  }

  const resetDate = new Date(resetsAt);

  if (Number.isNaN(resetDate.getTime())) {
    return null;
  }

  return formatRelativeReset(resetDate, language);
}

/**
 * Formats a valid reset date with coarse relative units.
 *
 * @param resetDate Reset date.
 * @param language Locale used for formatting.
 * @returns Relative reset text.
 */
function formatRelativeReset(resetDate: Date, language: string): string {
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

  if (diffHours < 48) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.ceil(diffHours / 24);

  return formatter.format(diffDays, "day");
}
