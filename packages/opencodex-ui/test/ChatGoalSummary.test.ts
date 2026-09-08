import { describe, expect, it } from "vitest";

import { formatGoalDuration } from "../src/components/dialogs/ChatGoalSummary";

describe("formatGoalDuration", () => {
  it("should display non-zero days, hours, minutes, and seconds", () => {
    expect(formatGoalDuration(90_061, translateUnit)).toBe(
      "1 day 1 hour 1 minute 1 second"
    );
  });

  it("should omit units whose value is zero", () => {
    expect(formatGoalDuration(3_600, translateUnit)).toBe("1 hour");
  });

  it("should keep a zero duration visible", () => {
    expect(formatGoalDuration(0, translateUnit)).toBe("0 seconds");
  });
});

/** Provides deterministic English labels for the formatter unit test. */
function translateUnit(key: string): string {
  const labels: Record<string, string> = {
    "goal.duration.day": "day",
    "goal.duration.hour": "hour",
    "goal.duration.minute": "minute",
    "goal.duration.second": "second",
    "goal.duration.zero": "0 seconds"
  };

  if (key.endsWith("s")) {
    return `${labels[key.slice(0, -1)]}s`;
  }

  return labels[key] ?? key;
}
