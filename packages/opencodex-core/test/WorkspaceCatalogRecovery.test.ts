import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from
  "@open-codex-ui/opencodex-cache";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WorkspaceExecutionService } from "../src/backend/workspaces/WorkspaceExecutionService";

describe("verified catalog recovery", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let service: WorkspaceExecutionService;
  let workspaceId: string;
  const client = { listThreads: vi.fn(), readThread: vi.fn() };
  const clients = { ensureClient: vi.fn() };
  const persistArchive = vi.fn();

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-recovery-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    const workspace = await cache.workspaces.resolvePath("/repo", "source");
    workspaceId = workspace.id;
    const fixture = new Database(path.join(directory, "opencodex-cache.sqlite"));
    try {
      fixture.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
        VALUES ('thread', ?, 'source', '/repo', ?, 'test')`).run(workspace.projectId, workspaceId);
    } finally {
      fixture.close();
    }
    client.listThreads.mockResolvedValue({ data: [{ id: "thread", cwd: "/repo" }], nextCursor: null });
    client.readThread.mockResolvedValue({ thread: { id: "thread", cwd: "/repo", status: { type: "notLoaded" } } });
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    persistArchive.mockImplementation((id, archived) => cache.updateThreadArchiveState(id, archived));
    service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, undefined, persistArchive);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  /** Simulates a lost mutation reply without making a remote mutation call. */
  async function reserve(operation: "archive" | "unarchive" | "delete"): Promise<void> {
    const reservation = await cache.workspaces.reserve(workspaceId, "thread", operation);
    await cache.workspaces.submitting(reservation.id);
    await cache.workspaces.fail(reservation.id);
  }

  it.each(["archive", "unarchive"] as const)(
    "should recover %s after reopening using positive paginated evidence and local cleanup",
    async (operation) => {
      await reserve(operation);
      await cache.close();
      cache = createOpenCodexSqliteCacheRepository({ directory });
      service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, undefined, persistArchive);
      client.listThreads.mockResolvedValueOnce({ data: [], nextCursor: "next" });
      persistArchive.mockImplementationOnce(async (id, archived) => {
        expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
        await cache.updateThreadArchiveState(id, archived);
      });

      await service.reconcile("thread");

      expect(clients.ensureClient).toHaveBeenCalledWith("source");
      expect(client.listThreads).toHaveBeenLastCalledWith(expect.objectContaining({
        cursor: "next", archived: operation === "archive", modelProviders: [],
        sourceKinds: expect.arrayContaining(["cli", "exec", "subAgentThreadSpawn"])
      }));
      expect(persistArchive).toHaveBeenCalledWith("thread", operation === "archive");
      expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    }
  );

  it("should retain a confirmed outcome when cache cleanup fails and allow verification to be retried", async () => {
    await reserve("archive");
    persistArchive.mockRejectedValueOnce(new Error("Cache unavailable"));

    await expect(service.reconcile("thread")).rejects.toThrow("Cache unavailable");
    expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
    await service.reconcile("thread");
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect(client.listThreads).toHaveBeenCalledTimes(2);
  });

  it.each([
    { data: [], nextCursor: null },
    { data: [{ id: "other", cwd: "/repo" }], nextCursor: null }
  ])("should not infer success from absence or an unrelated thread", async (response) => {
    await reserve("archive");
    client.listThreads.mockResolvedValue(response);

    await expect(service.reconcile("thread")).rejects.toThrow("not confirmed");
    expect(persistArchive).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
  });

  it("should reject repeated cursors instead of looping indefinitely", async () => {
    await reserve("archive");
    client.listThreads.mockResolvedValue({ data: [], nextCursor: "same" });

    await expect(service.reconcile("thread")).rejects.toThrow("repeated a catalog pagination cursor");
    expect(client.listThreads).toHaveBeenCalledTimes(2);
    expect(persistArchive).not.toHaveBeenCalled();
  });

  it.each([
    { id: "other", cwd: "/repo", status: { type: "idle" } },
    { id: "thread", cwd: "/elsewhere", status: { type: "idle" } },
    { id: "thread", cwd: "/repo", status: { type: "active" } }
  ])("should retain the guard when live identity or inactivity disagrees", async (thread) => {
    await reserve("archive");
    client.readThread.mockResolvedValue({ thread });

    await expect(service.reconcile("thread")).rejects.toThrow("could not be verified");
    expect(persistArchive).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
  });

  it("should bound pagination when Codex keeps returning new cursors", async () => {
    await reserve("archive");
    let page = 0;
    client.listThreads.mockImplementation(async () => {
      page += 1;
      return { data: [], nextCursor: String(page) };
    });

    await expect(service.reconcile("thread")).rejects.toThrow("not confirmed");
    expect(client.listThreads).toHaveBeenCalledTimes(100);
    expect(persistArchive).not.toHaveBeenCalled();
  });

  it("should reject a listed thread at a different path before the live read", async () => {
    await reserve("archive");
    client.listThreads.mockResolvedValue({ data: [{ id: "thread", cwd: "/other" }], nextCursor: null });

    await expect(service.reconcile("thread")).rejects.toThrow("different workspace path");
    expect(client.readThread).not.toHaveBeenCalled();
    expect(persistArchive).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "should recover confirmed deletion after reopening, including a missing cached thread: %s",
    async (removeThread) => {
      await reserve("delete");
      const pending = (await cache.workspaces.getReservationForThread("thread"))!;
      await cache.workspaces.confirmDeletion(pending.id);
      if (removeThread) {
        await cache.deleteThread("thread");
      }
      await cache.close();
      cache = createOpenCodexSqliteCacheRepository({ directory });
      const cleanup = vi.fn(async (id: string) => {
        expect(await cache.workspaces.isDeletionConfirmed(pending.id)).toBe(true);
        await cache.deleteThread(id);
      });
      service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, undefined,
        persistArchive, cleanup);

      await service.reconcileWorkspace(workspaceId);

      expect(cleanup).toHaveBeenCalledWith("thread", "source");
      expect(clients.ensureClient).not.toHaveBeenCalled();
      expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    }
  );

  it("should retain confirmed deletion when recovery cleanup fails", async () => {
    await reserve("delete");
    const pending = (await cache.workspaces.getReservationForThread("thread"))!;
    await cache.workspaces.confirmDeletion(pending.id);
    const cleanup = vi.fn().mockRejectedValueOnce(new Error("Cleanup failed")).mockResolvedValue(undefined);
    service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, undefined,
      persistArchive, cleanup);

    await expect(service.reconcile("thread")).rejects.toThrow("Cleanup failed");
    expect(await cache.workspaces.isDeletionConfirmed(pending.id)).toBe(true);
    await service.reconcile("thread");
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should not invoke installed deletion cleanup without positive evidence", async () => {
    await reserve("delete");
    const cleanup = vi.fn();
    service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, undefined,
      persistArchive, cleanup);

    await expect(service.reconcile("thread")).rejects.toThrow("idle status cannot reconcile");
    expect(cleanup).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
  });

  it("should retain uncertainty when persisting the successful response fails", async () => {
    const confirm = vi.spyOn(cache.workspaces, "confirmDeletion")
      .mockRejectedValueOnce(new Error("Confirmation write failed"));
    const cleanup = vi.fn();
    service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, undefined,
      persistArchive, cleanup);

    await expect(service.runCatalogMutation("thread", "delete", async (dispatch, acknowledge) => {
      await dispatch();
      await acknowledge();
      await cleanup();
    })).rejects.toThrow("Confirmation write failed");

    const pending = (await cache.workspaces.getReservationForThread("thread"))!;
    expect(await cache.workspaces.isDeletionConfirmed(pending.id)).toBe(false);
    await expect(service.reconcile("thread")).rejects.toThrow("idle status cannot reconcile");
    expect(cleanup).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("should retain deletion uncertainty without treating an empty list as proof", async () => {
    await reserve("delete");

    await expect(service.reconcile("thread")).rejects.toThrow("idle status cannot reconcile");
    expect(clients.ensureClient).not.toHaveBeenCalled();
    expect(persistArchive).not.toHaveBeenCalled();
  });

  it("should cancel preparation without connecting to Codex", async () => {
    await cache.workspaces.reserve(workspaceId, "thread", "archive");

    await service.reconcile("thread");

    expect(clients.ensureClient).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it("should preserve uncertainty when the source is unavailable", async () => {
    await reserve("archive");
    client.listThreads.mockRejectedValue(new Error("Source unavailable"));

    await expect(service.reconcile("thread")).rejects.toThrow("Source unavailable");
    expect(persistArchive).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toHaveLength(1);
  });
});
