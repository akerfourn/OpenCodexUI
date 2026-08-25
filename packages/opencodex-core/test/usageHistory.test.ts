/**
 * Covers source-wide usage history aggregation.
 */
import { describe, expect, it } from "vitest";

import type {
  CachedThreadTokenUsageSnapshot,
  CachedUsageRateLimitSnapshot
} from "@open-codex-ui/opencodex-cache";

import {
  buildUsageHistory,
  normalizeHistoryQuery
} from "../src/backend/usage/usageHistory";

describe("usage history", () => {
  it("should derive instant and cumulative tokens from total thread counters", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:00:00.000Z",
      to: "2026-07-31T12:00:00.000Z",
      aggregation: "raw"
    });
    const history = buildUsageHistory(
      query,
      [],
      [
        createTokenSnapshot("thread-1", "turn-1", 100, 100, "2026-07-31T09:00:00.000Z", 1),
        createTokenSnapshot("thread-1", "turn-1", 130, 30, "2026-07-31T10:00:00.000Z", 2),
        createTokenSnapshot("thread-1", "turn-1", 150, 50, "2026-07-31T10:05:00.000Z", 3),
        createTokenSnapshot("thread-1", "turn-2", 180, 30, "2026-07-31T11:00:00.000Z", 4)
      ]
    );

    expect(history.tokens.map((point) => point.instant.totalTokens)).toEqual([30, 20, 30]);
    expect(history.tokens.map((point) => point.cumulative.totalTokens)).toEqual([30, 50, 80]);
    expect(history.tokens.every((point) => point.isPartial)).toBe(false);
    expect(history.hasPartialTokenData).toBe(false);
  });

  it("should mark a first observed counter as partial", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:00:00.000Z",
      to: "2026-07-31T12:00:00.000Z",
      aggregation: "raw"
    });
    const history = buildUsageHistory(
      query,
      [],
      [createTokenSnapshot("thread-1", "turn-1", 130, 30, "2026-07-31T10:00:00.000Z", 1)]
    );

    expect(history.tokens[0]?.instant.totalTokens).toBe(130);
    expect(history.tokens[0]?.isPartial).toBe(true);
    expect(history.hasPartialTokenData).toBe(true);
  });

  it("should treat a reset counter as a partial new baseline", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:00:00.000Z",
      to: "2026-07-31T12:00:00.000Z",
      aggregation: "raw"
    });
    const history = buildUsageHistory(
      query,
      [],
      [
        createTokenSnapshot("thread-1", "turn-1", 100, 100, "2026-07-31T09:00:00.000Z", 1),
        createTokenSnapshot("thread-1", "turn-2", 30, 30, "2026-07-31T10:00:00.000Z", 2)
      ]
    );

    expect(history.tokens[0]?.instant.totalTokens).toBe(30);
    expect(history.tokens[0]?.isPartial).toBe(true);
    expect(history.hasPartialTokenData).toBe(true);
  });

  it("should aggregate rate limits and tokens into selected time buckets", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:00:00.000Z",
      to: "2026-07-31T12:00:00.000Z",
      aggregation: "hour"
    });
    const history = buildUsageHistory(
      query,
      [
        createRateLimitSnapshot("2026-07-31T10:05:00.000Z", 10, 1),
        createRateLimitSnapshot("2026-07-31T10:45:00.000Z", 20, 2)
      ],
      [
        createTokenSnapshot("thread-1", "turn-1", 100, 100, "2026-07-31T09:00:00.000Z", 3),
        createTokenSnapshot("thread-1", "turn-1", 130, 30, "2026-07-31T10:05:00.000Z", 4),
        createTokenSnapshot("thread-1", "turn-1", 150, 20, "2026-07-31T10:45:00.000Z", 5)
      ]
    );

    expect(history.rateLimits).toHaveLength(1);
    expect(history.rateLimits[0]?.points).toMatchObject([
      { observedAt: "2026-07-31T10:00:00.000Z", usedPercent: 20 }
    ]);
    expect(history.tokens).toMatchObject([
      {
        observedAt: "2026-07-31T10:00:00.000Z",
        instant: { totalTokens: 50 },
        cumulative: { totalTokens: 50 }
      }
    ]);
  });

  it("should anchor a partial first bucket to the requested start time", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:30:00.000Z",
      to: "2026-07-31T12:30:00.000Z",
      aggregation: "hour"
    });
    const history = buildUsageHistory(
      query,
      [],
      [
        createTokenSnapshot("thread-1", "turn-1", 10, 10, "2026-07-31T10:45:00.000Z", 1),
        createTokenSnapshot("thread-2", "turn-2", 20, 20, "2026-07-31T11:00:00.000Z", 2)
      ]
    );

    expect(history.tokens.map((point) => point.observedAt)).toEqual([
      "2026-07-31T10:30:00.000Z",
      "2026-07-31T11:00:00.000Z"
    ]);
  });

  it("should order simultaneous raw token events by persisted identifier", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:00:00.000Z",
      to: "2026-07-31T12:00:00.000Z",
      aggregation: "raw"
    });
    const history = buildUsageHistory(
      query,
      [],
      [
        createTokenSnapshot("thread-2", "turn-2", 20, 20, "2026-07-31T10:30:00.000Z", 2),
        createTokenSnapshot("thread-1", "turn-1", 10, 10, "2026-07-31T10:30:00.000Z", 1)
      ]
    );

    expect(history.tokens.map((point) => point.instant.totalTokens)).toEqual([10, 20]);
  });

  it("should ignore malformed rate-limit payloads", () => {
    const query = normalizeHistoryQuery({
      sourceId: "source-a",
      from: "2026-07-31T10:00:00.000Z",
      to: "2026-07-31T12:00:00.000Z",
      aggregation: "raw"
    });
    const malformedSnapshot = createRateLimitSnapshot("2026-07-31T10:30:00.000Z", 10, 1);
    malformedSnapshot.payloadJson = "{invalid";

    const history = buildUsageHistory(query, [malformedSnapshot], []);

    expect(history.rateLimits).toEqual([]);
  });

  it.each([
    ["2026-07-31T00:00:00.000Z", "2026-08-01T00:00:00.000Z", "raw"],
    ["2026-07-31T00:00:00.000Z", "2026-08-02T00:00:00.000Z", "minute"],
    ["2026-07-31T00:00:00.000Z", "2026-08-08T00:00:00.000Z", "hour"],
    ["2026-07-31T00:00:00.000Z", "2026-11-01T00:00:00.000Z", "day"]
  ] as const)(
    "should resolve automatic aggregation from %s to %s as %s",
    (from, to, aggregation) => {
      const query = normalizeHistoryQuery({ sourceId: "source-a", from, to });

      expect(query.aggregation).toBe(aggregation);
    }
  );

  it.each([
    [
      { sourceId: " ", from: "2026-07-31T10:00:00.000Z", to: "2026-07-31T12:00:00.000Z" },
      "A source is required"
    ],
    [
      { sourceId: "source-a", from: "invalid", to: "2026-07-31T12:00:00.000Z" },
      "dates must be valid"
    ],
    [
      { sourceId: "source-a", from: "2026-07-31T12:00:00.000Z", to: "2026-07-31T10:00:00.000Z" },
      "end date must be after"
    ]
  ])("should reject an invalid history query", (query, message) => {
    expect(() => normalizeHistoryQuery(query)).toThrow(message);
  });
});

function createTokenSnapshot(
  threadId: string,
  turnId: string,
  totalTokens: number,
  lastTokens: number,
  observedAt: string,
  id: number
): CachedThreadTokenUsageSnapshot {
  return {
    id,
    sourceId: "source-a",
    threadId,
    turnId,
    observedAt,
    total: createBreakdown(totalTokens),
    last: createBreakdown(lastTokens),
    modelContextWindow: null,
    model: null,
    reasoningEffort: null,
    serviceTier: null
  };
}

function createRateLimitSnapshot(
  observedAt: string,
  usedPercent: number,
  id: number
): CachedUsageRateLimitSnapshot {
  return {
    id,
    sourceId: "source-a",
    observedAt,
    origin: "read",
    reason: "request",
    fingerprint: `fingerprint-${id}`,
    payloadJson: JSON.stringify({
      raw: {},
      mapped: {
        sourceId: "source-a",
        limits: [
          {
            limitId: "codex",
            limitName: null,
            primary: {
              label: "weekly",
              usedPercent,
              remainingPercent: 100 - usedPercent
            },
            secondary: null
          }
        ]
      }
    })
  };
}

function createBreakdown(totalTokens: number) {
  return {
    totalTokens,
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };
}
