import type { OpenCodexUsageLimits } from "@open-codex-ui/opencodex-protocol";

/** Estimates whether the main covered quotas are still at or above 80% remaining. */
export function isUsageResetProbablyUnavailable(usage: OpenCodexUsageLimits | null): boolean {
  if (usage === null) {
    return false;
  }

  let windows = [usage.primary, usage.secondary].filter((window) => window !== null);

  // Pro resets cover the weekly allowance, even when a short window is reported.
  if (usage.planType === "pro" || usage.planType === "prolite") {
    windows = windows.filter((window) => window.label === "weekly");
  }

  return windows.length > 0 && windows.every((window) => (
    Number.isFinite(window.remainingPercent)
    && window.remainingPercent >= 80
    && window.remainingPercent <= 100
  ));
}

/** Returns the official reset guidance in the interface language. */
export function readUsageResetHelpUrl(language: string): string {
  let locale = "en";
  if (language.toLowerCase().startsWith("fr")) {
    locale = "fr-fr";
  }
  return `https://help.openai.com/${locale}/articles/20001498-how-resets-work-in-codex`;
}

/** Formats the fixed rule-verification date without depending on the user's timezone. */
export function formatUsageResetRuleDate(language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "long", timeZone: "UTC" })
    .format(new Date("2026-10-30T00:00:00.000Z"));
}
