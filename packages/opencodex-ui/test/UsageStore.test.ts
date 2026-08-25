/**
 * Covers source isolation and safety checks for banked usage resets.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  OpenCodexRequest,
  OpenCodexUsageLimits,
  OpenCodexUsageResetCredit,
  OpenCodexUsageResetCredits,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import { UsageStore } from "../src/stores/app/UsageStore";
import type { RootStore } from "../src/stores/RootStore";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("UsageStore reset credits", () => {
  it("should keep reset summaries isolated by source", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
      if (request.type !== "usage.read") {
        return { outcome: "reset" };
      }

      const sourceId = request.sourceId ?? "source-a";
      return createUsageSnapshot(sourceId, sourceId === "source-a"
        ? { availableCount: 1, credits: [createResetCredit()] }
        : null);
    });
    const store = new UsageStore(createRootStore(request));

    await store.load("source-a");
    await store.load("source-b");

    expect(store.getSourceUsage("source-a")?.rateLimitResetCredits?.availableCount).toBe(1);
    expect(store.getSourceUsage("source-b")?.rateLimitResetCredits).toBeNull();
  });

  it("should refuse consumption when reset details are incomplete", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
      if (request.type === "usage.read") {
        return createUsageSnapshot("source-a", {
          availableCount: 2,
          credits: [createResetCredit()]
        });
      }

      return { outcome: "reset" };
    });
    const store = new UsageStore(createRootStore(request));

    await store.load("source-a");

    await expect(store.consumeReset("source-a", "reset-1")).rejects.toThrow(
      "reset details are incomplete"
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should send the selected source and reset identifier when consuming", async () => {
    vi.useFakeTimers();
    const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
      if (request.type === "usage.read") {
        return createUsageSnapshot("source-a", {
          availableCount: 1,
          credits: [createResetCredit()]
        });
      }

      return { outcome: "reset" };
    });
    const store = new UsageStore(createRootStore(request));

    await store.load("source-a");
    await expect(store.consumeReset("source-a", "reset-1")).resolves.toEqual({ outcome: "reset" });

    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "usage.reset.consume",
      sourceId: "source-a",
      creditId: "reset-1",
      idempotencyKey: expect.any(String)
    }));
  });

  it("should reuse the idempotency key when a consume attempt is retried", async () => {
    vi.useFakeTimers();
    let consumeAttempts = 0;
    const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
      if (request.type === "usage.read") {
        return createUsageSnapshot("source-a", {
          availableCount: 1,
          credits: [createResetCredit()]
        });
      }

      consumeAttempts += 1;

      if (consumeAttempts === 1) {
        throw new Error("temporary transport failure");
      }

      return { outcome: "reset" };
    });
    const store = new UsageStore(createRootStore(request));

    await store.load("source-a");
    await expect(store.consumeReset("source-a", "reset-1")).rejects.toThrow(
      "temporary transport failure"
    );
    await store.consumeReset("source-a", "reset-1");

    const consumeRequests = request.mock.calls.filter(
      ([entry]) => entry.type === "usage.reset.consume"
    );
    expect(consumeRequests[0]?.[0]).toMatchObject({
      idempotencyKey: consumeRequests[1]?.[0].idempotencyKey
    });
  });
});

function createRootStore(request: RootStore["request"]): RootStore {
  return {
    appStore: {
      settingsStore: {
        settings: {
          defaultSourceId: "source-a",
          defaultUsageLimitId: null
        },
        setDefaultUsageLimitId: vi.fn()
      },
    },
    request
  } as unknown as RootStore;
}

function createUsageSnapshot(
  sourceId: string,
  rateLimitResetCredits: OpenCodexUsageResetCredits | null
): OpenCodexUsageSnapshot {
  return {
    sourceId,
    limits: [createUsageLimit()],
    rateLimitResetCredits,
    updatedAt: "2026-07-13T12:00:00.000Z"
  };
}

function createUsageLimit(): OpenCodexUsageLimits {
  return {
    limitId: "codex",
    limitName: "Codex",
    planType: "plus",
    primary: null,
    secondary: null,
    credits: null
  };
}

function createResetCredit(): OpenCodexUsageResetCredit {
  return {
    id: "reset-1",
    resetType: "codexRateLimits",
    status: "available",
    grantedAt: "2026-07-01T12:00:00.000Z",
    expiresAt: "2026-08-01T12:00:00.000Z",
    title: "Weekly reset",
    description: "Ready to redeem"
  };
}
