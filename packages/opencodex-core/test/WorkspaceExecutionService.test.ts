import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from
  "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { WorkspaceExecutionService } from "../src/backend/workspaces/WorkspaceExecutionService";
import { ThreadRuntimeHandler } from "../src/backend/threads/ThreadRuntimeHandler";
import { RuntimeEventDispatcher } from "../src/backend/runtime/RuntimeEventDispatcher";
import type { RuntimeSettingsPort, ProjectSourcePort } from "../src/backend/runtime/runtimePorts";

describe("workspace execution", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let service: WorkspaceExecutionService;
  let workspaceId: string;
  const client = {
    getMetadata: vi.fn(),
    readThread: vi.fn(),
    resumeThread: vi.fn(),
    startTurn: vi.fn()
  };
  const clients = { ensureClient: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-workspace-execution-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    await cache.upsertThreadIndex([{
      id: "thread-a", sessionId: null, parentThreadId: null, sourceId: "source-a",
      projectPath: "/source/repo", projectName: "repo", title: "Thread", codexTitle: "Thread",
      customTitle: null, preview: "", model: null, reasoningEffort: null,
      branchName: null, updatedAt: null, isArchived: false, threadSource: null,
      agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
    }]);
    workspaceId = (await cache.workspaces.getForThread("thread-a"))!.id;
    client.getMetadata.mockResolvedValue({ isDirectory: true });
    client.readThread.mockResolvedValue({ thread: { id: "thread-a", status: { type: "idle" } } });
    client.resumeThread.mockResolvedValue({});
    client.startTurn.mockResolvedValue({ turn: { id: "turn-a" } });
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    service = new WorkspaceExecutionService(cache.workspaces, clients);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should resolve a known thread without relying on a caller path or source", async () => {
    await service.run({ threadId: "thread-a", projectPath: null, sourceId: null }, async (context) => {
      expect(context).toMatchObject({ workspaceId, sourceId: "source-a", cwd: "/source/repo" });
      await service.submitting(context);
      await service.acknowledge(context, "turn-a");
    });

    expect(client.getMetadata).toHaveBeenCalledWith("/source/repo");
    expect(clients.ensureClient).toHaveBeenCalledWith("source-a");
  });

  it.each([
    { sourceId: "source-b", projectPath: null, message: "does not own" },
    { sourceId: null, projectPath: "/other", message: "does not match" },
    { sourceId: null, projectPath: "relative/path", message: "must be absolute" }
  ])("should reject contradictory or relative execution hints: $message", async (input) => {
    const action = vi.fn();
    await expect(service.run({ ...input, threadId: "thread-a" }, action)).rejects.toThrow(input.message);
    expect(action).not.toHaveBeenCalled();
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should reject concurrent selection and start while directory validation is pending", async () => {
    const entered = deferred();
    const proceed = deferred();
    client.getMetadata.mockImplementationOnce(async () => {
      entered.resolve();
      await proceed.promise;
      return { isDirectory: true };
    });
    const first = service.run({ threadId: "thread-a", projectPath: null, sourceId: null },
      async (reservation) => {
        await service.submitting(reservation);
        await service.acknowledge(reservation, "turn-a");
      });
    await entered.promise;

    await expect(service.select("thread-a", workspaceId)).rejects.toThrow("operation in progress");
    await expect(service.run({ threadId: "thread-a", projectPath: null, sourceId: null }, vi.fn()))
      .rejects.toThrow("operation in progress");
    await expect(cache.workspaces.relocate(workspaceId, "/moved")).rejects.toThrow("reserved or active");
    await expect(service.reconcileWorkspace(workspaceId)).rejects.toThrow("local execution operation");
    proceed.resolve();
    await first;
  });

  it("should cancel preparation when the source directory is unavailable", async () => {
    client.getMetadata.mockRejectedValue(new Error("Source disconnected"));
    const action = vi.fn();

    await expect(service.run({ threadId: "thread-a", projectPath: null, sourceId: null }, action))
      .rejects.toThrow("Source disconnected");
    expect(action).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect((await cache.workspaces.get(workspaceId))?.removedAt).toBeNull();
  });

  it("should recover preparation interrupted before a thread ID was returned", async () => {
    await cache.workspaces.reserve(workspaceId, null);
    await service.reconcileWorkspace(workspaceId);

    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should refuse an externally active thread before submitting a turn", async () => {
    client.readThread.mockResolvedValue({ thread: { status: { type: "active", activeFlags: [] } } });
    const action = vi.fn();

    await expect(service.run({ threadId: "thread-a", projectPath: null, sourceId: null }, action))
      .rejects.toThrow("Thread is active");
    expect(action).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it("should retain uncertain dispatch across reopening until explicit idle reconciliation", async () => {
    await expect(service.run({ threadId: "thread-a", projectPath: null, sourceId: null }, async (reservation) => {
      await service.submitting(reservation);
      throw new Error("Response lost");
    })).rejects.toThrow("Response lost");
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory });
    service = new WorkspaceExecutionService(cache.workspaces, clients);

    expect(await cache.workspaces.listReservations(workspaceId))
      .toEqual([expect.objectContaining({ state: "uncertain" })]);
    client.readThread.mockResolvedValueOnce({ thread: { status: { type: "active" } } });
    await expect(service.reconcile("thread-a")).rejects.toThrow("Thread is active");
    expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
    await service.reconcile("thread-a");
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it("should wire persisted context and early notifications through the actual thread runtime", async () => {
    const handler = new ThreadRuntimeHandler({
      backendOptions: { projectPath: "/host/wrong-default" },
      cacheRepository: cache,
      clients,
      settings: {
        getSettings: () => ({ defaultModel: "test", defaultReasoningEffort: "medium" })
      } as unknown as Pick<RuntimeSettingsPort, "getSettings">,
      events: new RuntimeEventDispatcher({ emitToHost: () => undefined }),
      projects: {
        resolveSource: async () => ({ id: "source-a" }),
        cacheProject: async () => null,
        readCachedProjects: async () => []
      } as unknown as Pick<ProjectSourcePort, "resolveSource" | "cacheProject" | "readCachedProjects">,
      handleClientError: (error) => { throw error; }
    });
    client.startTurn.mockImplementationOnce(async () => {
      const adapter = handler.getNotificationAdapters();
      adapter.recordWorkspaceNotification({
        method: "turn/started", params: { threadId: "thread-a", turn: { id: "turn-a" } }
      }, "source-a");
      adapter.recordWorkspaceNotification({
        method: "turn/completed", params: { threadId: "thread-a", turn: { id: "turn-a" } }
      }, "source-a");
      return { turn: { id: "turn-a" } };
    });

    const result = await handler.startTurn("thread-a", null, null, "continue", [], [], null, null, null);

    expect(result).toEqual({ threadId: "thread-a", turnId: "turn-a" });
    expect(client.startTurn).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/source/repo" }));
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });
});

/** Explicit synchronization point for deterministic concurrent-request tests. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
