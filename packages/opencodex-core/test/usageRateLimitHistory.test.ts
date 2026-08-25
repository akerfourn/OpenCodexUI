/**
 * Covers JSON preservation and stable fingerprints for rate-limit history.
 */
import { describe, expect, it } from "vitest";

import type { OpenCodexUsageSnapshot } from "@open-codex-ui/opencodex-protocol";

import { createUsageRateLimitHistorySnapshot } from "../src/backend/usage/usageRateLimitHistory";

describe("usage rate-limit history mapping", () => {
  it("should preserve raw fields and normalize the source association", () => {
    const usage = createUsage("source-a", [createLimit("codex", 10)]);
    const snapshot = createUsageRateLimitHistorySnapshot(
      "source-a",
      { rateLimits: { codex: { usedPercent: 10 } }, futureField: "kept" },
      usage,
      "notification",
      "accountRateLimitsUpdated"
    );
    const payload = JSON.parse(snapshot.payloadJson) as {
      raw: { futureField: string };
      mapped: OpenCodexUsageSnapshot;
    };

    expect(snapshot.sourceId).toBe("source-a");
    expect(payload.raw.futureField).toBe("kept");
    expect(payload.mapped.sourceId).toBe("source-a");
  });

  it("should use the same fingerprint when Codex changes limit ordering", () => {
    const first = createUsage("source-a", [
      createLimit("codex", 10),
      createLimit("spark", 20)
    ]);
    const second = createUsage("source-a", [
      createLimit("spark", 20),
      createLimit("codex", 10)
    ]);

    const firstSnapshot = createUsageRateLimitHistorySnapshot(
      "source-a",
      {},
      first,
      "read",
      "request"
    );
    const secondSnapshot = createUsageRateLimitHistorySnapshot(
      "source-a",
      {},
      second,
      "read",
      "request"
    );

    expect(firstSnapshot.fingerprint).toBe(secondSnapshot.fingerprint);
  });
});

function createUsage(sourceId: string, limits: OpenCodexUsageSnapshot["limits"]): OpenCodexUsageSnapshot {
  return {
    sourceId,
    limits,
    updatedAt: "2026-07-31T10:00:00.000Z"
  };
}

function createLimit(limitId: string, usedPercent: number) {
  return {
    limitId,
    limitName: null,
    planType: "pro",
    primary: {
      label: "weekly" as const,
      usedPercent,
      remainingPercent: 100 - usedPercent,
      windowDurationMins: 10080,
      resetsAt: null
    },
    secondary: null,
    credits: null
  };
}
