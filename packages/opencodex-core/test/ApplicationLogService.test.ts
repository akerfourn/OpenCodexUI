import type {
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { ApplicationLogService } from "../src/backend/ApplicationLogService";

describe("ApplicationLogService", () => {
  it("should keep cacheless reads and writes deterministic", async () => {
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ApplicationLogService({
      cacheRepository: null,
      events: { emit }
    });

    await expect(service.listLogs(null, 30)).resolves.toEqual({
      logs: [],
      hasMore: false
    });
    await expect(service.createLog("info", "message", null)).resolves.toEqual({ ok: true });
    await expect(service.deleteLog("log-1")).resolves.toEqual({ ok: true });
    await expect(service.clearLogs("all", 24, "hours")).resolves.toEqual({ ok: true });

    expect(emit).toHaveBeenCalledWith({ type: "logs.deleted", logId: "log-1" });
    expect(emit).toHaveBeenCalledWith({ type: "logs.cleared" });
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: "logs.created" }));
  });

  it("should forward the log pagination cursor and limit to the cache", async () => {
    const listLogs = vi.fn(async (_query: CachedLogListQuery): Promise<CachedLogPage> => ({
      logs: [],
      hasMore: false
    }));
    const repository = createRepository({ listLogs });
    const service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: vi.fn() }
    });

    await expect(service.listLogs("2026-08-09T10:00:00.000Z", 30)).resolves.toEqual({
      logs: [],
      hasMore: false
    });
    expect(listLogs).toHaveBeenCalledWith({
      beforeCreatedAt: "2026-08-09T10:00:00.000Z",
      limit: 30
    });
  });

  it("should create, delete, and clear all logs while emitting matching events", async () => {
    const createdLog: CachedLogEntry = {
      id: "log-1",
      type: "warning",
      message: "A warning",
      details: null,
      createdAt: "2026-08-09T10:00:00.000Z"
    };
    const createLog = vi.fn(async (input: CachedLogCreateInput): Promise<CachedLogEntry> => ({
      ...createdLog,
      type: input.type,
      message: input.message,
      details: input.details ?? null
    }));
    const deleteLog = vi.fn(async (_logId: string): Promise<void> => undefined);
    const clearLogs = vi.fn(async (): Promise<void> => undefined);
    const repository = createRepository({ createLog, deleteLog, clearLogs });
    const emittedEvents: OpenCodexEvent[] = [];
    const service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: (event) => emittedEvents.push(event) }
    });

    await expect(service.createLog("warning", "A warning", null)).resolves.toEqual({ ok: true });
    await expect(service.deleteLog("log-1")).resolves.toEqual({ ok: true });
    await expect(service.clearLogs("all", 24, "hours")).resolves.toEqual({ ok: true });

    expect(createLog).toHaveBeenCalledWith({
      type: "warning",
      message: "A warning",
      details: null
    });
    expect(deleteLog).toHaveBeenCalledWith("log-1");
    expect(clearLogs).toHaveBeenCalledOnce();
    expect(emittedEvents).toEqual([
      { type: "logs.created", log: createdLog },
      { type: "logs.deleted", logId: "log-1" },
      { type: "logs.cleared" }
    ]);
  });

  it.each([
    ["hours", "2026-08-09T10:34:56.789Z"],
    ["days", "2026-08-07T12:34:56.789Z"],
    ["weeks", "2026-07-26T12:34:56.789Z"],
    ["months", "2026-06-09T12:34:56.789Z"]
  ] as const)("should calculate a retention cutoff in %s", async (unit, expectedCutoff) => {
    const clearLogsOlderThan = vi.fn(async (_createdBefore: string): Promise<void> => undefined);
    const repository = createRepository({ clearLogsOlderThan });
    const service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: vi.fn() },
      now: () => new Date("2026-08-09T12:34:56.789Z")
    });

    await service.clearLogs("olderThan", 2, unit);

    expect(clearLogsOlderThan).toHaveBeenCalledWith(expectedCutoff);
  });

  it("should fall back to 24 retention units for an invalid amount", async () => {
    const clearLogsOlderThan = vi.fn(async (_createdBefore: string): Promise<void> => undefined);
    const repository = createRepository({ clearLogsOlderThan });
    const service = new ApplicationLogService({
      cacheRepository: repository,
      events: { emit: vi.fn() },
      now: () => new Date("2026-08-09T12:34:56.789Z")
    });

    await service.clearLogs("olderThan", Number.NaN, "hours");

    expect(clearLogsOlderThan).toHaveBeenCalledWith("2026-08-08T12:34:56.789Z");
  });

  it("should not propagate or emit when a fire-and-forget log write fails", async () => {
    const error = new Error("disk full");
    const createLog = vi.fn((): Promise<CachedLogEntry> => Promise.reject(error));
    const logger = vi.fn<(message: string) => void>();
    const emit = vi.fn<(event: OpenCodexEvent) => void>();
    const service = new ApplicationLogService({
      cacheRepository: createRepository({ createLog }),
      events: { emit },
      logger
    });

    expect(() => service.persistLog("error", "Failed to save", null)).not.toThrow();
    await flushMicrotasks();

    expect(logger).toHaveBeenCalledWith("application log write failed: Error: disk full");
    expect(emit).not.toHaveBeenCalled();
  });
});

/** Builds the narrow fake repository surface used by these service tests. */
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

/** Creates a stable fallback log entry for the fake repository. */
function createLogEntry(): CachedLogEntry {
  return {
    id: "log-default",
    type: "info",
    message: "default",
    details: null,
    createdAt: "2026-08-09T00:00:00.000Z"
  };
}

/** Lets rejected fire-and-forget promises run their handlers. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
