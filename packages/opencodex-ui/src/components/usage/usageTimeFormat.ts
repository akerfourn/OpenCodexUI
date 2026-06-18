/**
 * Formats usage reset timestamps for display.
 */

export function formatUsageReset(resetsAt: string | null, language: string): string {
  if (resetsAt === null) {
    return "-";
  }

  const resetDate = new Date(resetsAt);

  if (Number.isNaN(resetDate.getTime())) {
    return "-";
  }

  const absoluteReset = resetDate.toLocaleString();
  const relativeReset = formatRelativeReset(resetDate, language);

  return `${absoluteReset} (${relativeReset})`;
}

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
