import { describe, expect, it } from "vitest";
import type { OpenCodexUsageLimits, OpenCodexUsageWindow } from "@open-codex-ui/opencodex-protocol";

import {
  formatUsageResetRuleDate,
  isUsageResetProbablyUnavailable,
  readUsageResetHelpUrl
} from "../src/components/usage/usageResetEligibility";

/** Creates one main-account usage fixture with explicit remaining percentages. */
function usage(primary: number | null, secondary: number | null, planType = "plus"): OpenCodexUsageLimits {
  return { limitId: "codex", limitName: "Codex", planType, credits: null,
    primary: window(primary, "5h"), secondary: window(secondary, "weekly") };
}

/** Creates an optional quota without involving the current clock. */
function window(remaining: number | null, label: OpenCodexUsageWindow["label"]): OpenCodexUsageWindow | null {
  if (remaining === null) {
    return null;
  }
  return { label, remainingPercent: remaining, usedPercent: 100 - remaining,
    windowDurationMins: null, resetsAt: null };
}

describe("manual reset eligibility estimate", () => {
  it("should warn at exactly 80 percent remaining on every quota", () => {
    expect(isUsageResetProbablyUnavailable(usage(80, 100))).toBe(true);
    expect(isUsageResetProbablyUnavailable(usage(100, 80))).toBe(true);
  });

  it("should not warn when either covered quota has less than 80 percent remaining", () => {
    expect(isUsageResetProbablyUnavailable(usage(79.99, 100))).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(100, 79.99))).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(0, 100))).toBe(false);
  });

  it("should handle accounts without a five-hour quota", () => {
    expect(isUsageResetProbablyUnavailable(usage(null, 80))).toBe(true);
    expect(isUsageResetProbablyUnavailable(usage(null, 79))).toBe(false);
  });

  it("should check only the weekly covered quota on Pro", () => {
    expect(isUsageResetProbablyUnavailable(usage(5, 95, "pro"))).toBe(true);
    expect(isUsageResetProbablyUnavailable(usage(100, 79, "pro"))).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(90, null, "pro"))).toBe(false);
  });

  it("should include the monthly allowance on Go", () => {
    const monthlyUsage = usage(null, null, "go");
    monthlyUsage.primary = window(80, "usage");
    expect(isUsageResetProbablyUnavailable(monthlyUsage)).toBe(true);
    monthlyUsage.primary = window(79, "usage");
    expect(isUsageResetProbablyUnavailable(monthlyUsage)).toBe(false);
  });

  it("should avoid claiming ineligibility without valid quota data", () => {
    expect(isUsageResetProbablyUnavailable(null)).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(null, null))).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(NaN, null))).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(Infinity, null))).toBe(false);
    expect(isUsageResetProbablyUnavailable(usage(101, null))).toBe(false);
  });

  it("should localize the help URL and fixed verification date", () => {
    expect(readUsageResetHelpUrl("fr-FR")).toBe(
      "https://help.openai.com/fr-fr/articles/20001498-how-resets-work-in-codex"
    );
    expect(readUsageResetHelpUrl("en-US")).toBe(
      "https://help.openai.com/en/articles/20001498-how-resets-work-in-codex"
    );
    expect(formatUsageResetRuleDate("fr")).toBe("30 octobre 2026");
    expect(formatUsageResetRuleDate("en")).toBe("October 30, 2026");
  });
});
