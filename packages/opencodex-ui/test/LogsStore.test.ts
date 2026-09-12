import { describe, expect, it, vi } from "vitest";

import type { OpenCodexLogEntry, OpenCodexLogPage } from "@open-codex-ui/opencodex-protocol";

import { LogsStore } from "../src/stores/app/LogsStore";
import type { RootStore } from "../src/stores/RootStore";

describe("LogsStore", () => {
  it("should ignore an in-flight page after a backend deletion event", async () => {
    let resolvePage!: (page: OpenCodexLogPage) => void;
    const request = vi.fn(async () => new Promise<OpenCodexLogPage>((resolve) => {
      resolvePage = resolve;
    }));
    const store = new LogsStore({ request } as unknown as RootStore);
    const evictedLog = createLog("evicted");
    const liveLog = createLog("live");

    const loading = store.loadLatest();
    store.handleEvent({ type: "logs.created", log: liveLog });
    store.handleEvent({ type: "logs.deleted", logId: evictedLog.id });
    resolvePage({ logs: [evictedLog], hasMore: true });
    await loading;

    expect(store.logs).toEqual([liveLog]);
    expect(store.hasMore).toBe(true);
    expect(store.isLoading).toBe(false);
  });

  it("should keep pagination available when a live entry races with eviction", async () => {
    let resolvePage!: (page: OpenCodexLogPage) => void;
    const request = vi.fn()
      .mockImplementationOnce(async () => new Promise<OpenCodexLogPage>((resolve) => {
        resolvePage = resolve;
      }))
      .mockResolvedValueOnce({ logs: [], hasMore: false });
    const store = new LogsStore({ request } as unknown as RootStore);
    const evictedLog = createLog("evicted", "2026-09-12T00:00:00.000Z");
    const liveLog = createLog("live", "2026-09-12T00:00:01.000Z");

    const loading = store.loadLatest();
    store.handleEvent({ type: "logs.created", log: liveLog });
    store.handleEvent({ type: "logs.deleted", logId: evictedLog.id });
    resolvePage({ logs: [evictedLog], hasMore: true });
    await loading;

    await store.loadMore();

    expect(request).toHaveBeenNthCalledWith(2, {
      type: "logs.list",
      beforeCreatedAt: liveLog.createdAt,
      beforeId: liveLog.id,
      limit: 30,
      types: ["error", "warning"]
    });
    expect(store.logs).toEqual([liveLog]);
  });

  it("should ignore a stale older page after a session log is evicted", async () => {
    let resolvePage!: (page: OpenCodexLogPage) => void;
    const request = vi.fn(async () => new Promise<OpenCodexLogPage>((resolve) => {
      resolvePage = resolve;
    }));
    const store = new LogsStore({ request } as unknown as RootStore);
    const currentLog = createLog("current");
    store.logs = [currentLog];
    store.hasMore = true;

    const loading = store.loadMore();
    store.handleEvent({ type: "logs.deleted", logId: currentLog.id });
    resolvePage({ logs: [currentLog, createLog("older")], hasMore: false });
    await loading;

    expect(request).toHaveBeenCalledWith({
      type: "logs.list",
      beforeCreatedAt: currentLog.createdAt,
      beforeId: currentLog.id,
      limit: 30,
      types: ["error", "warning"]
    });
    expect(store.logs.map((log) => log.id)).toEqual(["older"]);
    expect(store.isLoading).toBe(false);
  });

  it("should preserve loaded history beyond the live buffer when a log is created", () => {
    const store = new LogsStore({ request: vi.fn() } as unknown as RootStore);
    const loadedHistory = Array.from({ length: 301 }, (_, index) =>
      createLog(`history-${index.toString().padStart(3, "0")}`, "2026-09-12T00:00:00.000Z")
    );
    store.logs = loadedHistory;
    store.hasMore = false;

    store.handleEvent({
      type: "logs.created",
      log: createLog("live", "2026-09-12T00:00:01.000Z")
    });

    expect(store.logs).toHaveLength(301);
    expect(store.logs[0]?.id).toBe("live");
    expect(store.logs).toContainEqual(loadedHistory[300]);
    expect(store.logs).not.toContainEqual(loadedHistory[0]);
    expect(store.hasMore).toBe(true);
  });

  it("should keep the renderer log buffer bounded while live events continue", () => {
    const store = new LogsStore({ request: vi.fn() } as unknown as RootStore);
    store.visibleLogTypes = ["warning"];
    store.hasMore = true;

    for (let index = 0; index < 1_000; index += 1) {
      store.handleEvent({ type: "logs.created", log: createLog(`log-${index}`) });
    }

    expect(store.logs.length).toBeLessThanOrEqual(300);
  });
});

/** Creates a minimal warning log for renderer state tests. */
function createLog(
  id: string,
  createdAt = `2026-09-12T00:00:${id.length.toString().padStart(2, "0")}.000Z`
): OpenCodexLogEntry {
  return {
    id,
    type: "warning",
    message: id,
    details: null,
    createdAt
  };
}
