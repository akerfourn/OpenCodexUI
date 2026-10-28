import { createInstance, type i18n } from "i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { formatUsageReset, formatUsageResetRelative as relativeReset } from "../src/components/usage/usageTimeFormat";
import { frUsage } from "../src/i18n/locales/fr/usage";
import { enUsage } from "../src/i18n/locales/en/usage";

let translations: i18n;
const now = Date.parse("2026-10-28T08:00:00Z");
beforeAll(async () => {
  translations = createInstance();
  await translations.init({ lng: "fr", fallbackLng: false,
    resources: { fr: { translation: frUsage }, en: { translation: enUsage } } });
});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });

/** Keeps countdown fixtures independent of the machine's local timezone. */
function afterHours(hours: number): string { return new Date(now + hours * 3_600_000).toISOString(); }

/** Ignores locale-specific nonbreaking spaces while asserting the full duration and plural forms. */
function formatUsageResetRelative(...args: Parameters<typeof relativeReset>): string | null {
  return relativeReset(...args)?.replace(/[\u00a0\u202f]/gu, " ") ?? null;
}

describe("usage and expiration countdowns", () => {
  it("should display 35 hours as one day and eleven hours in French and English", () => {
    expect(formatUsageResetRelative(afterHours(35), "fr", translations.getFixedT("fr")))
      .toBe("dans 1 jour et 11 heures");
    expect(formatUsageResetRelative(afterHours(35), "en", translations.getFixedT("en")))
      .toBe("in 1 day and 11 hours");
  });

  it("should omit zero hours and preserve the remainder after several days", () => {
    const t = translations.getFixedT("fr");
    expect(formatUsageResetRelative(afterHours(24), "fr", t)).toBe("dans 1 jour");
    expect(formatUsageResetRelative(afterHours(48), "fr", t)).toBe("dans 2 jours");
    expect(formatUsageResetRelative(afterHours(49), "fr", t)).toBe("dans 2 jours et 1 heure");
    expect(formatUsageResetRelative(afterHours(243), "fr", t)).toBe("dans 10 jours et 3 heures");
  });

  it("should round up remaining hours without producing a 24-hour remainder", () => {
    const t = translations.getFixedT("fr");
    expect(formatUsageResetRelative(afterHours(35.1), "fr", t)).toBe("dans 1 jour et 12 heures");
    expect(formatUsageResetRelative(afterHours(47.99), "fr", t)).toBe("dans 2 jours");
    expect(formatUsageResetRelative(afterHours(23.99), "fr", t)).toBe("dans 1 jour");
  });

  it("should preserve short countdowns and expired timestamps", () => {
    const t = translations.getFixedT("fr");
    expect(formatUsageResetRelative(afterHours(23), "fr", t)).toBe("dans 23 heures");
    expect(formatUsageResetRelative(afterHours(0.5), "fr", t)).toBe("dans 30 minutes");
    expect(formatUsageResetRelative(afterHours(-1), "fr", t)).toBe("dans 0 minute");
  });

  it("should keep invalid dates unavailable and reuse the duration in absolute reset labels", () => {
    const t = translations.getFixedT("fr");
    expect(formatUsageResetRelative(null, "fr", t)).toBeNull();
    expect(formatUsageResetRelative("invalid", "fr", t)).toBeNull();
    expect(formatUsageReset(null, "fr", t)).toBe("-");
    expect(formatUsageReset(afterHours(35), "fr", t).replace(/[\u00a0\u202f]/gu, " "))
      .toContain("(dans 1 jour et 11 heures)");
  });
});
