/** Covers usage and rate-limit mapping from Codex payloads. */
import { describe, expect, it } from "vitest";

import { mapThreadTokenUsageNotification } from "../src/backend/threads/threadTokenUsageMapping";
import { correctUsageLimitNotification } from "../src/backend/usage/usageCorrections";
import { mapUsageLimitsNotification, mapUsageLimitsResponse } from "../src/backend/usage/usageMapping";

describe("usage mapping", () => {
  it("should preserve usage limit ids from rate-limit response keys", () => {
    const usage = mapUsageLimitsResponse(
      {
        rateLimitsByLimitId: {
          codex: {
            primary: {
              usedPercent: 25,
              windowDurationMins: 300,
              resetsAt: 1_000
            }
          },
          spark: {
            primary: {
              usedPercent: 75,
              windowDurationMins: 300,
              resetsAt: 2_000
            }
          }
        }
      },
      "source-1"
    );

    expect(usage?.sourceId).toBe("source-1");
    expect(usage?.limits).toEqual([
      expect.objectContaining({ limitId: "codex" }),
      expect.objectContaining({ limitId: "spark" })
    ]);
  });

  it("should ignore ambiguous usage notifications without a limit id", () => {
    const usage = mapUsageLimitsNotification(
      {
        rateLimits: {
          primary: {
            usedPercent: 80,
            windowDurationMins: 300,
            resetsAt: 1_000
          }
        }
      },
      "source-1"
    );

    expect(usage).toBeNull();
  });

  it("should map source-scoped reset details and expiration dates", () => {
    const usage = mapUsageLimitsResponse(
      {
        rateLimitsByLimitId: {},
        rateLimitResetCredits: {
          availableCount: 2,
          credits: [
            {
              id: "reset-1",
              resetType: "codexRateLimits",
              status: "available",
              grantedAt: 1_000,
              expiresAt: 2_000,
              title: "Weekly reset",
              description: "Ready to redeem"
            },
            {
              id: "reset-2",
              resetType: "codexRateLimits",
              status: "available",
              grantedAt: 1_500,
              expiresAt: null,
              title: null,
              description: null
            }
          ]
        }
      },
      "source-2"
    );

    expect(usage).toMatchObject({
      sourceId: "source-2",
      limits: [],
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [
          {
            id: "reset-1",
            expiresAt: "1970-01-01T00:33:20.000Z"
          },
          {
            id: "reset-2",
            expiresAt: null
          }
        ]
      }
    });
  });

  it("should omit reset details from sparse rate-limit notifications", () => {
    const usage = mapUsageLimitsNotification(
      {
        rateLimits: {
          limitId: "codex",
          primary: {
            usedPercent: 80,
            windowDurationMins: 300,
            resetsAt: 1_000
          }
        }
      },
      "source-3"
    );

    expect(usage).toMatchObject({ sourceId: "source-3" });
    expect(usage).not.toHaveProperty("rateLimitResetCredits");
  });

  it("should correct a Spark notification limit id only for an active Spark model", () => {
    const usage = mapUsageLimitsNotification(
      {
        rateLimits: {
          limitId: "codex",
          primary: {
            usedPercent: 92,
            windowDurationMins: 10_080,
            resetsAt: 1_000
          }
        }
      },
      "source-1"
    );

    const corrected = correctUsageLimitNotification(usage, ["gpt-5.3-codex-spark"]);
    const unchanged = correctUsageLimitNotification(usage, []);

    expect(corrected).toMatchObject({
      sourceId: "source-1",
      limits: [expect.objectContaining({ limitId: "codex_bengalfox" })]
    });
    expect(unchanged).toBe(usage);
    expect(corrected).not.toBe(usage);
  });

  it("should use the latest turn usage for context-window pressure", () => {
    const usage = mapThreadTokenUsageNotification({
      threadId: "thread-1",
      turnId: "turn-1",
      tokenUsage: {
        total: {
          totalTokens: 1_000_000,
          inputTokens: 900_000,
          cachedInputTokens: 100_000,
          outputTokens: 90_000,
          reasoningOutputTokens: 10_000
        },
        last: {
          totalTokens: 125_000,
          inputTokens: 100_000,
          cachedInputTokens: 50_000,
          outputTokens: 20_000,
          reasoningOutputTokens: 5_000
        },
        modelContextWindow: 250_000
      }
    });

    expect(usage).toMatchObject({
      contextWindowTokens: 125_000,
      usedPercent: 50,
      total: {
        totalTokens: 1_000_000
      }
    });
  });
});
