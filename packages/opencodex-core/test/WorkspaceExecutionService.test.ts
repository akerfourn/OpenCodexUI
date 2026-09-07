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
    listThreads: vi.fn(),
    archiveThread: vi.fn(),
    unarchiveThread: vi.fn(),
    deleteThread: vi.fn(),
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

  /** Exercises the production composition with the same persisted workspace guard. */
  function createHandler(): ThreadRuntimeHandler {
    return new ThreadRuntimeHandler({
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
  }

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it.each(["archiveThread", "deleteThread", "unarchiveThread"] as const)(
    "should block %s before source access while execution recovery is pending",
    async (method) => {
      const reservation = await cache.workspaces.reserve(workspaceId, "thread-a");
      await cache.workspaces.submitting(reservation.id);
      await cache.workspaces.fail(reservation.id);
      const handler = createHandler();

      await expect(handler[method]("thread-a")).rejects.toThrow("pending workspace execution");
      expect(clients.ensureClient).not.toHaveBeenCalled();
      expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
    }
  );

  it("should keep catalog mutations and local workspace operations mutually exclusive", async () => {
    const entered = deferred();
    const proceed = deferred();
    const mutation = service.runCatalogMutation("thread-a", "archive", async () => {
      entered.resolve();
      await proceed.promise;
    });
    await entered.promise;

    await expect(service.select("thread-a", workspaceId)).rejects.toThrow("operation in progress");
    await expect(service.reconcile("thread-a")).rejects.toThrow("operation in progress");
    await expect(service.runCatalogMutation("thread-a", "archive", vi.fn())).rejects.toThrow("operation in progress");
    proceed.resolve();
    await mutation;
    await expect(service.runCatalogMutation("thread-a", "archive", async () => "ok")).resolves.toBe("ok");
  });

  it("should release the local catalog gate when the remote action fails", async () => {
    await expect(service.runCatalogMutation("thread-a", "archive", async () => {
      throw new Error("Source disconnected");
    })).rejects.toThrow("Source disconnected");

    await expect(service.runCatalogMutation("thread-a", "archive", async () => "retry")).resolves.toBe("retry");
  });

  it.each(["archive", "unarchive", "delete"] as const)(
    "should retain lost %s responses after reopening and refuse idle-only recovery",
    async (operation) => {
      await expect(service.runCatalogMutation("thread-a", operation, async (dispatch) => {
        await dispatch();
        throw new Error("Response lost");
      })).rejects.toThrow("Response lost");
      await cache.close();
      cache = createOpenCodexSqliteCacheRepository({ directory });
      service = new WorkspaceExecutionService(cache.workspaces, clients);

      await expect(service.reconcile("thread-a")).rejects.toThrow("idle status cannot reconcile");
      await expect(service.runCatalogMutation("thread-a", operation, vi.fn())).rejects.toThrow(
        "pending workspace execution"
      );
      expect(clients.ensureClient).not.toHaveBeenCalled();
      expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
        { operation, state: "uncertain", sourceId: "source-a" }
      ]);
    }
  );

  it("should hold a durable catalog reservation until successful cache cleanup", async () => {
    await service.runCatalogMutation("thread-a", "delete", async (dispatch) => {
      expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
        { operation: "delete", state: "preparing" }
      ]);
      await dispatch();
      await expect(cache.workspaces.relocate(workspaceId, "/moved")).rejects.toThrow("reserved or active");
      expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
        { operation: "delete", state: "submitting" }
      ]);
    });

    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it.each(["archiveThread", "unarchiveThread", "deleteThread"] as const)(
    "should persist dispatch before %s reaches Codex and release after cleanup",
    async (method) => {
      client[method].mockImplementationOnce(async () => {
        expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
          { state: "submitting" }
        ]);
        return {};
      });

      await expect(createHandler()[method]("thread-a")).resolves.toEqual({ ok: true });
      expect(client[method]).toHaveBeenCalledWith("thread-a");
      expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    }
  );

  it.each(["archiveThread", "deleteThread"] as const)(
    "should keep %s reserved when local persistence fails after the source reply",
    async (method) => {
      const cacheMethod = method === "archiveThread" ? "updateThreadArchiveState" : "deleteThread";
      const write = vi.spyOn(cache, cacheMethod).mockRejectedValueOnce(new Error("Cache unavailable"));
      client[method].mockResolvedValue({});

      await expect(createHandler()[method]("thread-a")).rejects.toThrow("Cache unavailable");

      expect(client[method]).toHaveBeenCalledWith("thread-a");
      expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
        { state: "uncertain" }
      ]);
      write.mockRestore();
    }
  );

  it("should recover a confirmed delete through the runtime without sending another RPC", async () => {
    client.deleteThread.mockResolvedValue({});
    const write = vi.spyOn(cache, "deleteThread").mockRejectedValueOnce(new Error("Cache unavailable"));
    const handler = createHandler();
    await expect(handler.deleteThread("thread-a")).rejects.toThrow("Cache unavailable");
    const pending = (await cache.workspaces.getReservationForThread("thread-a"))!;
    expect(await cache.workspaces.isDeletionConfirmed(pending.id)).toBe(true);

    await handler.workspaces.reconcile("thread-a");

    expect(client.deleteThread).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(2);
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    write.mockRestore();
  });

  it("should wire archive recovery through the production runtime", async () => {
    const reservation = await cache.workspaces.reserve(workspaceId, "thread-a", "archive");
    await cache.workspaces.submitting(reservation.id);
    await cache.workspaces.fail(reservation.id);
    client.listThreads.mockResolvedValue({
      data: [{ id: "thread-a", cwd: "/source/repo" }], nextCursor: null
    });
    client.readThread.mockResolvedValue({ thread: {
      id: "thread-a", cwd: "/source/repo", status: { type: "notLoaded" }
    } });
    const write = vi.spyOn(cache, "updateThreadArchiveState");

    await createHandler().workspaces.reconcile("thread-a");

    expect(write).toHaveBeenCalledWith("thread-a", true);
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect(client.archiveThread).not.toHaveBeenCalled();
    expect(client.unarchiveThread).not.toHaveBeenCalled();
    expect(client.deleteThread).not.toHaveBeenCalled();
    write.mockRestore();
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
    const handler = createHandler();
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
    expect(await cache.workspaces.listTurnContexts("thread-a")).toEqual([
      expect.objectContaining({ sourceId: "source-a", threadId: "thread-a", turnId: "turn-a",
        workspaceId, cwd: "/source/repo" })
    ]);
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
