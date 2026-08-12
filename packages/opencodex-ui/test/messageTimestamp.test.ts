import { afterEach, describe, expect, it, vi } from "vitest";

import { formatMessageTimestamp } from "../src/components/messages/messageTimestamp";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatMessageTimestamp", () => {
  it.each([null, "invalid"])("should return an empty label for %s", (value) => {
    expect(formatMessageTimestamp(value, translate)).toBe("");
  });

  it("should translate a timestamp from today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));

    const result = formatMessageTimestamp("2026-08-12T08:30:00.000Z", translate);

    expect(result).toMatch(/^message\.todayAt:/);
  });

  it("should translate a timestamp from yesterday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));

    const result = formatMessageTimestamp("2026-08-11T08:30:00.000Z", translate);

    expect(result).toMatch(/^message\.yesterdayAt:/);
  });

  it("should format an older timestamp as a date and time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));

    const result = formatMessageTimestamp("2026-08-01T08:30:00.000Z", translate);

    expect(result).toContain(" - ");
    expect(result).not.toContain("message.");
  });
});

/** Returns the requested key and formatted time for deterministic assertions. */
function translate(key: string, values?: Record<string, string>): string {
  return `${key}:${values?.time ?? ""}`;
}
