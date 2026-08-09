import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  CachedSource,
  CachedUsageRateLimitSnapshot,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { UsageRuntimeService } from "../src/backend/UsageRuntimeService";
import type { UsageRuntimeServiceOptions } from "../src/backend/UsageRuntimeService";

describe("UsageRuntimeService", () => {
  it("should read canonical usage, emit it, and persist the original payload", async () => {
    const source = createSource("canonical-source");
    const response = createUsageResponse(12);
    const request = vi.fn(async () => response);
    const saveUsageRateLimitSnapshot = vi.fn(async (_snapshot: CachedUsageRateLimitSnapshot) => undefined);
    const emittedEvents: OpenCodexEvent[] = [];
    const { service, resolveRequestedSource, ensureClient } = createService({
      source,
      request,
      saveUsageRateLimitSnapshot,
      emittedEvents
    });

    const usage = await service.readUsageLimits("requested-source", "bootstrap");
    await flushMicrotasks();

    expect(usage?.sourceId).toBe(source.id);
    expect(resolveRequestedSource).toHaveBeenCalledWith("requested-source");
    expect(ensureClient).toHaveBeenCalledWith(source.id);
    expect(request).toHaveBeenCalledWith("account/rateLimits/read", undefined);
    expect(emittedEvents).toEqual([
      { type: "usage.updated", sourceId: source.id, usage }
    ]);
    expect(saveUsageRateLimitSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: source.id,
      origin: "read",
      reason: "bootstrap",
      payloadJson: expect.stringContaining(JSON.stringify(response))
    }));
  });

  it("should emit a null usage update after a canonical request failure", async () => {
    const source = createSource("canonical-source");
    const error = new Error("rate limits unavailable");
    const logger = vi.fn<(message: string) => void>();
    const emittedEvents: OpenCodexEvent[] = [];
    const { service } = createService({
      source,
      request: vi.fn(async () => {
        throw error;
      }),
      emittedEvents,
      logger
    });

    await expect(service.readUsageLimits(source.id)).resolves.toBeNull();

    expect(logger).toHaveBeenCalledWith(`account/rateLimits/read unavailable: ${String(error)}`);
    expect(emittedEvents).toEqual([
      { type: "usage.updated", sourceId: source.id, usage: null }
    ]);
  });

  it("should emit null without persisting a non-mappable rate-limit response", async () => {
    const source = createSource("canonical-source");
    const saveUsageRateLimitSnapshot = vi.fn(async () => undefined);
    const emittedEvents: OpenCodexEvent[] = [];
    const { service } = createService({
      source,
      request: vi.fn(async () => ({
        rateLimits: {},
        rateLimitsByLimitId: null,
        rateLimitResetCredits: null
      })),
      saveUsageRateLimitSnapshot,
      emittedEvents
    });

    await expect(service.readUsageLimits(source.id)).resolves.toBeNull();
    await flushMicrotasks();

    expect(emittedEvents).toEqual([
      { type: "usage.updated", sourceId: source.id, usage: null }
    ]);
    expect(saveUsageRateLimitSnapshot).not.toHaveBeenCalled();
  });

  it("should keep source resolution errors silent to the UI", async () => {
    const error = new Error("unknown source");
    const logger = vi.fn<(message: string) => void>();
    const emittedEvents: OpenCodexEvent[] = [];
    const { service } = createService({
      source: createSource("source-a"),
      resolveRequestedSource: vi.fn(async () => {
        throw error;
      }),
      emittedEvents,
      logger
    });

    await expect(service.readUsageLimits("missing-source")).resolves.toBeNull();

    expect(logger).toHaveBeenCalledWith(`account/rateLimits/read unavailable: ${String(error)}`);
    expect(emittedEvents).toEqual([]);
  });

  it("should preserve validation and request values while refreshing after reset consumption", async () => {
    const source = createSource("canonical-source");
    const usageResponse = createUsageResponse(14);
    const request = vi.fn()
      .mockResolvedValueOnce({ outcome: "reset" })
      .mockResolvedValueOnce(usageResponse);
    const { service } = createService({ source, request });

    await expect(service.consumeUsageReset(
      "requested-source",
      " credit-id ",
      " idempotency-key "
    )).resolves.toEqual({ outcome: "reset" });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "account/rateLimitResetCredit/consume",
      { creditId: " credit-id ", idempotencyKey: " idempotency-key " }
    );
    expect(request).toHaveBeenNthCalledWith(2, "account/rateLimits/read", undefined);
  });

  it("should preserve a successful reset outcome when the usage refresh fails", async () => {
    const source = createSource("canonical-source");
    const refreshError = new Error("refresh unavailable");
    const request = vi.fn()
      .mockResolvedValueOnce({ outcome: "alreadyRedeemed" })
      .mockRejectedValueOnce(refreshError);
    const emittedEvents: OpenCodexEvent[] = [];
    const logger = vi.fn<(message: string) => void>();
    const { service } = createService({ source, request, emittedEvents, logger });

    await expect(service.consumeUsageReset(
      "requested-source",
      "credit-id",
      "idempotency-key"
    )).resolves.toEqual({ outcome: "alreadyRedeemed" });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "account/rateLimitResetCredit/consume",
      { creditId: "credit-id", idempotencyKey: "idempotency-key" }
    );
    expect(request).toHaveBeenNthCalledWith(2, "account/rateLimits/read", undefined);
    expect(emittedEvents).toEqual([
      { type: "usage.updated", sourceId: source.id, usage: null }
    ]);
    expect(logger).toHaveBeenCalledWith(
      `account/rateLimits/read unavailable: ${String(refreshError)}`
    );
  });

  it("should reject blank reset inputs before resolving a source", async () => {
    const resolveRequestedSource = vi.fn(async () => createSource("source-a"));
    const { service } = createService({
      source: createSource("source-a"),
      resolveRequestedSource
    });

    await expect(service.consumeUsageReset("  ", "credit", "key"))
      .rejects.toThrow("A source is required to consume a rate-limit reset.");
    await expect(service.consumeUsageReset("source-a", "  ", "key"))
      .rejects.toThrow("A reset-credit identifier is required.");
    await expect(service.consumeUsageReset("source-a", "credit", "  "))
      .rejects.toThrow("An idempotency key is required to consume a reset.");
    expect(resolveRequestedSource).not.toHaveBeenCalled();
  });

  it("should correct notifications, record active models, and isolate sources", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const logEntries: Array<{ message: string; details: Record<string, unknown> }> = [];
    const persistLog = vi.fn((_type: string, message: string, details: unknown) => {
      logEntries.push({ message, details: details as Record<string, unknown> });
    });
    const { service } = createService({
      source: createSource("source-a"),
      emittedEvents,
      persistLog
    });

    service.onCommitGenerationStarted("source-a", "gpt-5.3-codex-spark");
    service.onCommitGenerationStarted("source-a", "gpt-5.3-codex-spark");
    service.onCommitGenerationStarted("source-b", "other-model");
    service.handleRateLimitsUpdated("source-a", createNotificationParams(22));
    service.handleRateLimitsUpdated("source-b", createNotificationParams(33));

    expect(emittedEvents[0]).toMatchObject({
      type: "usage.updated",
      sourceId: "source-a",
      usage: { limits: [{ limitId: "codex_bengalfox" }] }
    });
    expect(emittedEvents[1]).toMatchObject({
      type: "usage.updated",
      sourceId: "source-b",
      usage: { limits: [{ limitId: "other-limit" }] }
    });
    expect(logEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "Codex rate limits updated",
        details: expect.objectContaining({
          sourceId: "source-a",
          activeCommitModels: ["gpt-5.3-codex-spark"],
          correctionApplied: true
        })
      }),
      expect.objectContaining({
        message: "Codex rate limits updated",
        details: expect.objectContaining({
          sourceId: "source-b",
          activeCommitModels: ["other-model"]
        })
      })
    ]));
  });

  it("should diagnose and deduplicate ambiguous notifications without emitting usage", () => {
    const rateLimits = {
      primary: {
        usedPercent: 22,
        windowDurationMins: 10_080,
        resetsAt: 1_000
      }
    };
    const persistLog = vi.fn();
    const emittedEvents: OpenCodexEvent[] = [];
    const { service } = createService({
      source: createSource("source-a"),
      emittedEvents,
      persistLog
    });

    service.handleRateLimitsUpdated("source-a", { rateLimits });
    service.handleRateLimitsUpdated("source-a", { rateLimits });

    expect(emittedEvents).toEqual([]);
    expect(persistLog).toHaveBeenCalledOnce();
    expect(persistLog).toHaveBeenCalledWith(
      "info",
      "Codex rate-limit notification ignored",
      expect.objectContaining({
        sourceId: "source-a",
        origin: "notification",
        reason: "accountRateLimitsUpdated",
        mapping: "ignored",
        activeCommitModels: [],
        rawRateLimits: rateLimits
      })
    );
  });

  it("should preserve the current null/default source alias behavior", () => {
    const logEntries: Array<{ details: Record<string, unknown> }> = [];
    const { service } = createService({
      source: createSource("source-a"),
      defaultSourceId: null,
      persistLog: vi.fn((_type: string, _message: string, details: unknown) => {
        logEntries.push({ details: details as Record<string, unknown> });
      })
    });

    service.onCommitGenerationStarted(null, "model-a");
    service.handleRateLimitsUpdated("source-a", createNotificationParams(10));

    expect(logEntries[0]?.details.activeCommitModels).toEqual([]);
  });

  it("should count null models under a configured default source without leaking sources", () => {
    const logEntries: Array<{ details: Record<string, unknown> }> = [];
    const { service } = createService({
      source: createSource("source-default"),
      defaultSourceId: "source-default",
      persistLog: vi.fn((_type: string, _message: string, details: unknown) => {
        logEntries.push({ details: details as Record<string, unknown> });
      })
    });

    service.onCommitGenerationStarted(null, null);
    service.onCommitGenerationStarted(null, null);
    service.onCommitGenerationStarted("source-other", "model-other");
    service.handleRateLimitsUpdated("source-default", createNotificationParams(10));
    service.onCommitGenerationFinished(null, null);
    service.handleRateLimitsUpdated("source-default", createNotificationParams(11));
    service.onCommitGenerationFinished(null, null);
    service.handleRateLimitsUpdated("source-default", createNotificationParams(12));
    service.handleRateLimitsUpdated("source-other", createNotificationParams(20));

    expect(logEntries.map(({ details }) => ({
      sourceId: details.sourceId,
      activeCommitModels: details.activeCommitModels
    }))).toEqual([
      { sourceId: "source-default", activeCommitModels: [null] },
      { sourceId: "source-default", activeCommitModels: [null] },
      { sourceId: "source-default", activeCommitModels: [] },
      { sourceId: "source-other", activeCommitModels: ["model-other"] }
    ]);
  });

  it("should refresh usage asynchronously after a completed turn", async () => {
    const request = vi.fn(async () => createUsageResponse(42));
    const emittedEvents: OpenCodexEvent[] = [];
    const { service } = createService({
      source: createSource("source-a"),
      request,
      emittedEvents
    });

    service.handleTurnCompleted("source-a");
    await flushMicrotasks();

    expect(request).toHaveBeenCalledWith("account/rateLimits/read", undefined);
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toMatchObject({ type: "usage.updated", sourceId: "source-a" });
  });

  it("should absorb fire-and-forget history write failures", async () => {
    const error = new Error("disk full");
    const logger = vi.fn<(message: string) => void>();
    const { service } = createService({
      source: createSource("source-a"),
      saveUsageRateLimitSnapshot: vi.fn(async () => {
        throw error;
      }),
      logger
    });

    await service.readUsageLimits("source-a");
    await flushMicrotasks();

    expect(logger).toHaveBeenCalledWith(`rate-limit history write failed: ${String(error)}`);
  });

  it("should return a normalized empty history without a cache", async () => {
    const { service } = createService({ source: createSource("source-a") });

    await expect(service.readUsageHistory(
      " source-a ",
      "2026-08-09T10:00:00.000Z",
      "2026-08-09T11:00:00.000Z"
    )).resolves.toMatchObject({
      sourceId: "source-a",
      rateLimits: [],
      tokens: [],
      hasPartialTokenData: false
    });
  });

  it("should query and return source history with the requested aggregation", async () => {
    const from = "2026-08-09T10:00:00.000Z";
    const to = "2026-08-09T12:00:00.000Z";
    const listUsageRateLimitSnapshots = vi.fn(async () => []);
    const listSourceTokenUsageSnapshots = vi.fn(async () => []);
    const cacheRepository = createRepository({
      listUsageRateLimitSnapshots,
      listSourceTokenUsageSnapshots
    });
    const { service } = createService({
      source: createSource("source-a"),
      cacheRepository
    });

    await expect(service.readUsageHistory(" source-a ", from, to, "hour"))
      .resolves.toEqual({
        sourceId: "source-a",
        from,
        to,
        aggregation: "hour",
        rateLimits: [],
        tokens: [],
        hasPartialTokenData: false
      });

    expect(listUsageRateLimitSnapshots).toHaveBeenCalledWith({
      sourceId: "source-a",
      fromObservedAt: from,
      toObservedAt: to,
      includeBaselineBeforeFrom: true,
      limit: 200_000
    });
    expect(listSourceTokenUsageSnapshots).toHaveBeenCalledWith({
      sourceId: "source-a",
      fromObservedAt: from,
      toObservedAt: to,
      limit: 200_000
    });
  });
});

type ServiceOverrides = {
  source: CachedSource;
  request?: (...args: never[]) => Promise<unknown>;
  resolveRequestedSource?: (sourceId: string | null) => Promise<CachedSource>;
  saveUsageRateLimitSnapshot?: (snapshot: CachedUsageRateLimitSnapshot) => Promise<void>;
  cacheRepository?: OpenCodexCacheRepository;
  emittedEvents?: OpenCodexEvent[];
  persistLog?: (type: string, message: string, details: unknown) => void;
  logger?: (message: string) => void;
  defaultSourceId?: string | null;
};

/** Builds a service with deterministic source, client, cache, and transport doubles. */
function createService(overrides: ServiceOverrides) {
  const request = overrides.request ?? (async () => createUsageResponse(10));
  const client = { request } as unknown as CodexAppServerClient;
  const resolveRequestedSource = vi.fn(
    overrides.resolveRequestedSource ?? (async () => overrides.source)
  );
  const ensureClient = vi.fn(async () => client);
  const emittedEvents = overrides.emittedEvents ?? [];
  const persistLog = overrides.persistLog ?? (() => undefined);
  const service = new UsageRuntimeService({
    cacheRepository: overrides.cacheRepository ?? (
      overrides.saveUsageRateLimitSnapshot === undefined
        ? null
        : createRepository({
          saveUsageRateLimitSnapshot: overrides.saveUsageRateLimitSnapshot
        })
    ),
    getSettings: () => ({
      defaultSourceId: overrides.defaultSourceId ?? null
    } as OpenCodexSettings),
    resolveRequestedSource,
    ensureClient,
    isPrerelease: true,
    emit: (event) => emittedEvents.push(event),
    persistLog: persistLog as UsageRuntimeServiceOptions["persistLog"],
    logger: overrides.logger
  });

  return { service, resolveRequestedSource, ensureClient, client };
}

type RepositoryOverrides = Partial<Pick<
  OpenCodexCacheRepository,
  | "saveUsageRateLimitSnapshot"
  | "listUsageRateLimitSnapshots"
  | "listSourceTokenUsageSnapshots"
>>;

/** Builds the narrow cache repository surface used by usage tests. */
function createRepository(overrides: RepositoryOverrides): OpenCodexCacheRepository {
  return {
    saveUsageRateLimitSnapshot: overrides.saveUsageRateLimitSnapshot ?? (async () => undefined),
    listUsageRateLimitSnapshots: overrides.listUsageRateLimitSnapshots ?? (async () => []),
    listSourceTokenUsageSnapshots: overrides.listSourceTokenUsageSnapshots ?? (async () => [])
  } as unknown as OpenCodexCacheRepository;
}

/** Creates the minimal canonical source required by the service contract. */
function createSource(id: string): CachedSource {
  return { id } as CachedSource;
}

/** Creates a complete account rate-limit response with one Codex limit. */
function createUsageResponse(usedPercent: number): Record<string, unknown> {
  return {
    rateLimits: createRateLimit(usedPercent, "codex"),
    rateLimitsByLimitId: null,
    rateLimitResetCredits: null
  };
}

/** Creates a sparse notification payload with a distinct limit identifier. */
function createNotificationParams(usedPercent: number): Record<string, unknown> {
  return { rateLimits: createRateLimit(usedPercent, "other-limit") };
}

/** Creates one raw rate-limit object accepted by the usage mapper. */
function createRateLimit(usedPercent: number, limitId: string): Record<string, unknown> {
  return {
    limitId,
    limitName: limitId,
    planType: "pro",
    primary: {
      usedPercent,
      windowDurationMins: 10_080,
      resetsAt: 1_000
    }
  };
}

/** Allows fire-and-forget persistence and refresh promises to settle. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
