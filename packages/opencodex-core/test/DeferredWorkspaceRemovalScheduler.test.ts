import { describe, expect, it, vi } from "vitest";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import { canCheckWorkspaceRemovalSource, DeferredWorkspaceRemovalScheduler } from "../src/backend/workspaces/DeferredWorkspaceRemovalScheduler";

const removal: OpenCodexWorkspaceRemoval = { id: "request", projectId: "project", workspaceId: "workspace",
  sourceId: "source", primaryWorkspaceId: "primary", projectPath: "/repo", workspacePath: "/checkout",
  repositoryPath: "/repo/.git", state: "preparing", gitExitCode: null, deferredState: "queued" };

describe("automatic deletion scheduling", () => {
  it("should postpone active agents and source startup without making unrelated project commands a global blocker", () => {
    const snapshot = { sourceId: "source", phase: "ready" as const, isActive: true, manuallyStopped: false, error: null,
      activity: { requestMethods: [], turnCount: 0, threadCount: 0, approvalCount: 0, processCount: 2 } };
    expect(canCheckWorkspaceRemovalSource(snapshot)).toBe(true);
    for (const key of ["turnCount", "threadCount", "approvalCount"] as const) {
      expect(canCheckWorkspaceRemovalSource({ ...snapshot, activity: { ...snapshot.activity, [key]: 1 } })).toBe(false);
    }
    expect(canCheckWorkspaceRemovalSource({ ...snapshot, activity: { ...snapshot.activity, requestMethods: ["turn/start"] } })).toBe(false);
    expect(canCheckWorkspaceRemovalSource({ ...snapshot, phase: "stopping" })).toBe(false);
    expect(canCheckWorkspaceRemovalSource({ ...snapshot, phase: "stopped" })).toBe(false);
    expect(canCheckWorkspaceRemovalSource({ ...snapshot, activity: undefined })).toBe(false);
  });
  it("should leave offline or busy sources untouched and process the exact source-owned request once ready", async () => {
    const operations = { queued: vi.fn(async () => [removal]), processQueued: vi.fn(async () => undefined) };
    const ready = vi.fn(() => false);
    const report = vi.fn(async () => undefined);
    const scheduler = new DeferredWorkspaceRemovalScheduler(operations, ready, report);
    await scheduler.tick();
    expect(ready).toHaveBeenCalledWith("source");
    expect(operations.processQueued).not.toHaveBeenCalled();
    ready.mockReturnValue(true);
    await scheduler.tick();
    expect(operations.processQueued).toHaveBeenCalledOnce();
    expect(operations.processQueued).toHaveBeenCalledWith("request");
    expect(report).not.toHaveBeenCalled();
    await scheduler.dispose();
  });

  it("should serialize concurrent ticks and finish already claimed work before disposal", async () => {
    let finish!: () => void;
    const inFlight = new Promise<void>(resolve => { finish = resolve; });
    const operations = { queued: vi.fn(async () => [removal]), processQueued: vi.fn(async () => await inFlight) };
    const scheduler = new DeferredWorkspaceRemovalScheduler(operations, () => true, vi.fn());
    const first = scheduler.tick();
    await Promise.resolve();
    expect(operations.processQueued).toHaveBeenCalledOnce();
    const second = scheduler.tick();
    let disposed = false;
    const shutdown = scheduler.dispose().then(() => { disposed = true; });
    expect(disposed).toBe(false);
    finish();
    await Promise.all([first, second, shutdown]);
    await scheduler.tick();
    expect(disposed).toBe(true);
    expect(operations.processQueued).toHaveBeenCalledOnce();
  });

  it("should isolate infrastructure errors and still process another source", async () => {
    const failure = new Error("Cache write unavailable");
    const operations = {
      queued: vi.fn(async () => [removal, { ...removal, id: "other", sourceId: "other-source" }]),
      processQueued: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined)
    };
    const report = vi.fn(async () => undefined);
    const scheduler = new DeferredWorkspaceRemovalScheduler(operations, () => true, report);
    await scheduler.tick();
    expect(report).toHaveBeenCalledWith(failure);
    expect(operations.processQueued.mock.calls).toEqual([["request"], ["other"]]);
    await scheduler.dispose();
  });

  it("should poll with bounded timers and stop polling after disposal", async () => {
    vi.useFakeTimers();
    const operations = { queued: vi.fn(async () => []), processQueued: vi.fn() };
    const scheduler = new DeferredWorkspaceRemovalScheduler(operations, () => false, vi.fn());
    try {
      scheduler.start();
      scheduler.start();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(operations.queued).toHaveBeenCalledTimes(3);
      await scheduler.dispose();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(operations.queued).toHaveBeenCalledTimes(3);
    } finally {
      await scheduler.dispose();
      vi.useRealTimers();
    }
  });
});
