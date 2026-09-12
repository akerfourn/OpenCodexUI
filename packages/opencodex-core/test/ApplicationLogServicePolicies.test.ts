import type {
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationLogService } from "../src/backend/support/ApplicationLogService";

describe("ApplicationLogService policies", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should keep disabled and session entries out of the cache", async () => {
    const createLog = vi.fn(async (input: CachedLogCreateInput): Promise<CachedLogEntry> => ({
      id: "persisted",
      type: input.type,
      message: input.message,
      details: input.details ?? null,
      createdAt: "2026-08-09T00:00:00.000Z"
    }));
    const repository = createRepository({ createLog });
    const settings = createSettings({
      info: { mode: "disabled" },
      performanceSlowdown: { mode: "session", maxEntries: 2 }
    });
    const events: OpenCodexEvent[] = [];
    const service = new ApplicationLogService({
      cacheRepository: repository,
      settings: { getSettings: () => settings },
      events: { emit: (event) => events.push(event) }
    });

    await service.createLog("info", "Disabled", null);
    await service.createLog("warning", "Session one", null, "performanceSlowdown");

    expect(createLog).not.toHaveBeenCalled();
    expect((await service.listLogs(null, 10)).logs).toMatchObject([
      { message: "Session one", storage: "session", category: "performanceSlowdown" }
    ]);
    expect(events).toContainEqual(expect.objectContaining({ type: "logs.created" }));
    await service.dispose();
  });

  it("should evict the oldest session entry when a category count is exceeded", async () => {
    const events: OpenCodexEvent[] = [];
    const service = new ApplicationLogService({
      cacheRepository: null,
      events: { emit: (event) => events.push(event) },
      settings: {
        getSettings: () => createSettings({
          info: { mode: "session", maxEntries: 2 },
          performanceSlowdown: { mode: "unlimited" }
        })
      }
    });

    await service.createLog("info", "First", null);
    await service.createLog("info", "Second", null);
    await service.createLog("info", "Third", null);

    expect((await service.listLogs(null, 10)).logs.map((log) => log.message)).toEqual([
      "Third",
      "Second"
    ]);
    expect(events.filter((event) => event.type === "logs.deleted")).toHaveLength(1);
    await service.dispose();
  });

  it("should trim each session category when limits change together", async () => {
    const initialPolicies = {
      info: { mode: "session" as const, maxEntries: 3 },
      performanceSlowdown: { mode: "session" as const, maxEntries: 3 }
    };
    const events: OpenCodexEvent[] = [];
    const service = new ApplicationLogService({
      cacheRepository: null,
      events: { emit: (event) => events.push(event) },
      settings: { getSettings: () => createSettings(initialPolicies) }
    });

    await service.createLog("info", "Info old", null);
    await service.createLog("warning", "Performance old", null, "performanceSlowdown");
    await service.createLog("info", "Info new", null);
    await service.createLog("warning", "Performance new", null, "performanceSlowdown");
    await service.applySettings({
      logPolicies: {
        info: { mode: "session", maxEntries: 1 },
        performanceSlowdown: { mode: "session", maxEntries: 1 }
      }
    } as OpenCodexSettings);

    expect((await service.listLogs(null, 10)).logs.map((log) => log.message)).toEqual([
      "Performance new",
      "Info new"
    ]);
    expect(events.filter((event) => event.type === "logs.deleted")).toHaveLength(2);
    await service.dispose();
  });

  it("should skip a session entry that exceeds the total byte bound", async () => {
    const logger = vi.fn<(message: string) => void>();
    const service = new ApplicationLogService({
      cacheRepository: null,
      events: { emit: vi.fn() },
      logger,
      settings: {
        getSettings: () => createSettings({
          info: { mode: "session", maxEntries: 2 },
          performanceSlowdown: { mode: "unlimited" }
        })
      }
    });

    await service.createLog("info", "Too large", "x".repeat(5 * 1024 * 1024));

    expect((await service.listLogs(null, 10)).logs).toEqual([]);
    expect(logger).toHaveBeenCalledWith(
      "session application log buffer failed: Error: entry exceeds the byte limit"
    );
    await service.dispose();
  });

  it("should keep an uncloneable diagnostic payload safe for session transport", async () => {
    const service = new ApplicationLogService({
      cacheRepository: null,
      events: { emit: vi.fn() },
      settings: {
        getSettings: () => createSettings({
          info: { mode: "session", maxEntries: 2 },
          performanceSlowdown: { mode: "unlimited" }
        })
      }
    });
    const details = {
      toJSON(): never {
        throw new Error("cannot serialize");
      },
      toString(): never {
        throw new Error("cannot stringify");
      }
    };

    await expect(service.createLog("info", "Safe fallback", details)).resolves.toEqual({ ok: true });
    expect((await service.listLogs(null, 10)).logs[0]?.details)
      .toBe("[unserializable log details]");
    await service.dispose();
  });

  it("should drain an accepted persistent write before disposal", async () => {
    const createLog = vi.fn(async (input: CachedLogCreateInput): Promise<CachedLogEntry> => ({
      id: "persisted",
      type: input.type,
      message: input.message,
      details: input.details ?? null,
      createdAt: "2026-08-09T00:00:00.000Z"
    }));
    const repository = createRepository({ createLog });
    const service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: vi.fn() },
      settings: {
        getSettings: () => createSettings({
          info: { mode: "disabled" },
          performanceSlowdown: { mode: "unlimited" }
        })
      }
    });

    service.persistLog("error", "Accepted", null);
    await service.dispose();
    service.persistLog("error", "Dropped", null);

    expect(createLog).toHaveBeenCalledOnce();
    expect(createLog).toHaveBeenCalledWith({ type: "error", message: "Accepted", details: null });
  });

  it("should purge retained logs on start and stop its timer on dispose", async () => {
    vi.useFakeTimers();
    const clearLogsOlderThan = vi.fn(async (_createdBefore: string): Promise<void> => undefined);
    const repository = createRepository({ clearLogsOlderThan });
    const service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: vi.fn() },
      now: () => new Date("2026-08-09T12:00:00.000Z"),
      retentionPurgeIntervalMs: 100,
      settings: {
        getSettings: () => createSettings({
          info: { mode: "retained", retentionDays: 2 },
          performanceSlowdown: { mode: "unlimited" }
        })
      }
    });

    await service.start();
    expect(clearLogsOlderThan).toHaveBeenCalledTimes(1);
    clearLogsOlderThan.mockClear();
    await vi.advanceTimersByTimeAsync(100);
    expect(clearLogsOlderThan).toHaveBeenCalledTimes(1);

    await service.dispose();
    clearLogsOlderThan.mockClear();
    await vi.advanceTimersByTimeAsync(300);
    expect(clearLogsOlderThan).not.toHaveBeenCalled();
  });
});

/** Builds the narrow cache surface needed by policy tests. */
function createRepository(
  overrides: Partial<{
    createLog: (input: CachedLogCreateInput) => Promise<CachedLogEntry>;
    listLogs: (query: CachedLogListQuery) => Promise<CachedLogPage>;
    deleteLog: (logId: string) => Promise<void>;
    clearLogs: () => Promise<void>;
    clearLogsOlderThan: (createdBefore: string) => Promise<void>;
  }> = {}
): OpenCodexCacheRepository {
  return {
    createLog: overrides.createLog ?? (async () => createLogEntry()),
    listLogs: overrides.listLogs ?? (async () => ({ logs: [], hasMore: false })),
    deleteLog: overrides.deleteLog ?? (async () => undefined),
    clearLogs: overrides.clearLogs ?? (async () => undefined),
    clearLogsOlderThan: overrides.clearLogsOlderThan ?? (async () => undefined)
  } as unknown as OpenCodexCacheRepository;
}

/** Creates a stable fallback cache entry. */
function createLogEntry(): CachedLogEntry {
  return {
    id: "log-default",
    type: "warning",
    message: "default",
    details: null,
    createdAt: "2026-08-09T00:00:00.000Z"
  };
}

/** Builds the settings fields relevant to application log policy tests. */
function createSettings(logPolicies: OpenCodexSettings["logPolicies"]): OpenCodexSettings {
  return { logPolicies } as OpenCodexSettings;
}
