/**
 * Covers de-duplication of pre-release rate-limit diagnostics.
 */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexUsageLimits,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import { UsageRateLimitDiagnostics } from "../src/backend/usageRateLimitDiagnostics";

describe("UsageRateLimitDiagnostics", () => {
  it("should not write duplicate snapshots from repeated reads", () => {
    const writeLog = vi.fn();
    const diagnostics = new UsageRateLimitDiagnostics(true, writeLog);
    const snapshot = createSnapshot([createLimit("codex", 77)]);

    diagnostics.record("source-1", snapshot, "read", "bootstrap", []);
    diagnostics.record("source-1", snapshot, "read", "request", []);

    expect(writeLog).toHaveBeenCalledTimes(1);
  });

  it("should log a changed sparse notification and keep it merged with later reads", () => {
    const writeLog = vi.fn();
    const diagnostics = new UsageRateLimitDiagnostics(true, writeLog);
    const initialSnapshot = createSnapshot([
      createLimit("codex", 77),
      createLimit("spark", 92)
    ]);
    const changedSparkSnapshot = createSnapshot([createLimit("spark", 91)]);
    const refreshedSnapshot = createSnapshot([
      createLimit("codex", 77),
      createLimit("spark", 91)
    ]);

    diagnostics.record("source-1", initialSnapshot, "read", "bootstrap", []);
    diagnostics.record(
      "source-1",
      changedSparkSnapshot,
      "notification",
      "accountRateLimitsUpdated",
      ["gpt-5.3-codex-spark"]
    );
    diagnostics.record("source-1", refreshedSnapshot, "read", "request", []);

    expect(writeLog).toHaveBeenCalledTimes(2);
    expect(writeLog).toHaveBeenLastCalledWith(
      "info",
      "Codex rate limits updated",
      expect.objectContaining({
        origin: "notification",
        reason: "accountRateLimitsUpdated",
        activeCommitModels: ["gpt-5.3-codex-spark"]
      })
    );
  });

  it("should mark a diagnostic when a usage correction was applied", () => {
    const writeLog = vi.fn();
    const diagnostics = new UsageRateLimitDiagnostics(true, writeLog);

    diagnostics.record(
      "source-1",
      createSnapshot([createLimit("codex_bengalfox", 92)]),
      "notification",
      "accountRateLimitsUpdated",
      ["gpt-5.3-codex-spark"],
      true
    );

    expect(writeLog).toHaveBeenCalledWith(
      "info",
      "Codex rate limits updated",
      expect.objectContaining({ correctionApplied: true })
    );
  });

  it("should log a changed reset-credit summary even when limits stay stable", () => {
    const writeLog = vi.fn();
    const diagnostics = new UsageRateLimitDiagnostics(true, writeLog);
    const initialSnapshot = createSnapshot([createLimit("codex", 77)]);
    const changedResetSnapshot = {
      ...initialSnapshot,
      rateLimitResetCredits: {
        availableCount: 1,
        credits: null
      }
    };

    diagnostics.record("source-1", initialSnapshot, "read", "bootstrap", []);
    diagnostics.record("source-1", changedResetSnapshot, "read", "request", []);

    expect(writeLog).toHaveBeenCalledTimes(2);
    expect(writeLog).toHaveBeenLastCalledWith(
      "info",
      "Codex rate limits updated",
      expect.objectContaining({
        rateLimitResetCredits: changedResetSnapshot.rateLimitResetCredits
      })
    );
  });

  it("should stay silent for stable builds", () => {
    const writeLog = vi.fn();
    const diagnostics = new UsageRateLimitDiagnostics(false, writeLog);

    diagnostics.record(
      "source-1",
      createSnapshot([createLimit("codex", 77)]),
      "read",
      "bootstrap",
      []
    );

    expect(writeLog).not.toHaveBeenCalled();
  });

  it("should log an ambiguous notification only when its raw limits change", () => {
    const writeLog = vi.fn();
    const diagnostics = new UsageRateLimitDiagnostics(true, writeLog);
    const rateLimits = {
      limitId: null,
      primary: {
        usedPercent: 92,
        windowDurationMins: 10_080,
        resetsAt: 1_000
      }
    };

    diagnostics.recordIgnoredNotification("source-1", rateLimits, ["gpt-5.3-codex-spark"]);
    diagnostics.recordIgnoredNotification("source-1", rateLimits, ["gpt-5.3-codex-spark"]);

    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(writeLog).toHaveBeenCalledWith(
      "info",
      "Codex rate-limit notification ignored",
      expect.objectContaining({
        mapping: "ignored",
        rawRateLimits: rateLimits
      })
    );
  });
});

function createSnapshot(limits: OpenCodexUsageLimits[]): OpenCodexUsageSnapshot {
  return {
    sourceId: "source-1",
    limits,
    updatedAt: "2026-07-17T12:00:00.000Z"
  };
}

function createLimit(limitId: string, usedPercent: number): OpenCodexUsageLimits {
  return {
    limitId,
    limitName: limitId,
    planType: "pro",
    primary: {
      label: "weekly",
      usedPercent,
      remainingPercent: 100 - usedPercent,
      windowDurationMins: 10_080,
      resetsAt: "2026-07-24T12:00:00.000Z"
    },
    secondary: null,
    credits: null
  };
}
