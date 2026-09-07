import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from
  "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { WorkspaceExecutionService } from "../src/backend/workspaces/WorkspaceExecutionService";
import type { WorkspaceResumeExpectation } from "../src/backend/workspaces/workspaceResumeVerification";

/** Destination policy intentionally differs from the original workspace's policy. */
function expectation(): WorkspaceResumeExpectation {
  return {
    cwd: "/B", runtimeWorkspaceRoots: ["/B"],
    activePermissionProfile: { id: "workspace-B", extends: ":workspace" },
    sandbox: { type: "workspaceWrite", writableRoots: [], networkAccess: false,
      excludeTmpdirEnvVar: true, excludeSlashTmp: true },
    approvalPolicy: "never", approvalsReviewer: "user"
  };
}

describe("workspace selection with durable cache and source RPC boundary", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let originalId: string;
  let service: WorkspaceExecutionService;
  const client = { readThread: vi.fn(), getMetadata: vi.fn(), unsubscribeThread: vi.fn(), resumeThread: vi.fn() };
  const clients = { ensureClient: vi.fn() };
  const preparation = { requireSupported: vi.fn(), prepare: vi.fn(), prepareCreation: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-selection-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    const original = await cache.workspaces.resolvePath("/A", "source");
    originalId = original.id;
    // The secondary-workspace catalogue API belongs to the later worktree creation stage.
    const fixture = new Database(path.join(directory, "opencodex-cache.sqlite"));
    try {
      fixture.prepare(`INSERT INTO project_workspaces (id, project_id, source_id, source_key, path)
        VALUES ('B', ?, 'source', 'source', '/B')`).run(original.projectId);
      fixture.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
        VALUES ('thread', ?, 'source', '/A', ?, 'test')`).run(original.projectId, originalId);
    } finally {
      fixture.close();
    }
    client.readThread.mockResolvedValue({ thread: {
      id: "thread", status: { type: "idle" }, canAcceptDirectInput: true, source: "cli"
    } });
    client.getMetadata.mockResolvedValue({ isDirectory: true });
    client.unsubscribeThread.mockResolvedValue({ status: "unsubscribed" });
    client.resumeThread.mockResolvedValue({ ...expectation(), thread: {
      id: "thread", status: { type: "idle" }, canAcceptDirectInput: true
    } });
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    preparation.requireSupported.mockResolvedValue(undefined);
    preparation.prepare.mockImplementation(async () => expectation());
    service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, preparation);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should create and persist a new secondary conversation without resuming an empty rollout", async () => {
    preparation.prepareCreation.mockResolvedValue({ permissions: "prepared-profile" });
    const original = await cache.getThread("thread");
    const created = await service.createThread("B", "/B", "source", async (parameters) => {
      expect(parameters.permissions).toBe("prepared-profile");
      const thread = { ...original!.thread, id: "new-thread", projectPath: "/B" };
      await cache.upsertThreadIndex([thread]);
      return thread;
    });
    expect(created.id).toBe("new-thread");
    expect(await cache.workspaces.getForThread(created.id)).toMatchObject({ id: "B", path: "/B" });
    expect(await cache.workspaces.listReservations("B")).toEqual([]);
    expect(client.resumeThread).not.toHaveBeenCalled();
  });

  it("should retain an unbound reservation when a new-thread reply is lost", async () => {
    preparation.prepareCreation.mockResolvedValue({});
    await expect(service.createThread("B", "/B", "source", async () => {
      throw new Error("Lost thread/start reply");
    })).rejects.toThrow("Lost thread/start reply");
    expect(await cache.workspaces.listReservations("B")).toEqual([
      expect.objectContaining({ state: "uncertain", threadId: null })
    ]);
    await expect(service.reconcileWorkspace("B")).rejects.toThrow("Unbound dispatched");
  });

  it("should reject catalog changes before dispatch while a transition is persisted", async () => {
    await cache.workspaces.transitions.begin("thread", "B");
    const action = vi.fn();

    await expect(service.runCatalogMutation("thread", "archive", action)).rejects.toThrow(
      "Reconcile the workspace transition"
    );
    expect(action).not.toHaveBeenCalled();
    expect(clients.ensureClient).not.toHaveBeenCalled();
    expect(await cache.workspaces.transitions.getForThread("thread")).not.toBeNull();
  });

  it("should commit the selection only after a verified source-owned resume", async () => {
    client.resumeThread.mockImplementationOnce(async () => {
      expect((await cache.workspaces.getForThread("thread"))?.id).toBe(originalId);
      expect(await cache.workspaces.transitions.getForThread("thread")).toMatchObject({ state: "submitting" });
      return { ...expectation(), thread: { id: "thread", status: { type: "idle" }, canAcceptDirectInput: true } };
    });
    await service.select("thread", "B");
    expect((await cache.workspaces.getForThread("thread"))?.id).toBe("B");
    expect(await cache.workspaces.transitions.getForThread("thread")).toBeNull();
    expect(clients.ensureClient).toHaveBeenCalledWith("source");
  });

  it("should fail closed when lifecycle and permission preparation is not installed", async () => {
    service = new WorkspaceExecutionService(cache.workspaces, clients);
    await expect(service.select("thread", "B")).rejects.toThrow("not enabled");
    expect((await cache.workspaces.getForThread("thread"))?.id).toBe(originalId);
    expect(await cache.workspaces.transitions.getForThread("thread")).toBeNull();
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
    await expect(service.select("thread", originalId)).resolves.toBeUndefined();
  });

  it("should cancel preparation when lifecycle validation rejects running processes", async () => {
    preparation.requireSupported.mockRejectedValue(new Error("workspace has a running process"));
    await expect(service.select("thread", "B")).rejects.toThrow("running process");
    expect(preparation.prepare).not.toHaveBeenCalled();
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
    expect(await cache.workspaces.transitions.getForThread("thread")).toBeNull();
  });

  it("should retain both blockers on a lost response and recover explicitly after a real reopen", async () => {
    client.resumeThread.mockRejectedValueOnce(new Error("connection lost"));
    await expect(service.select("thread", "B")).rejects.toThrow("connection lost");
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory });
    service = new WorkspaceExecutionService(cache.workspaces, clients, undefined, preparation);
    expect(await cache.workspaces.transitions.getForThread("thread")).toMatchObject({ state: "uncertain" });
    expect((await cache.workspaces.getForThread("thread"))?.id).toBe(originalId);
    await expect(service.select("thread", "B")).rejects.toThrow("reconcile before selecting");
    await expect(service.run({ threadId: "thread", projectPath: null, sourceId: null }, vi.fn()))
      .rejects.toThrow("unresolved transition");
    await service.observe({ method: "turn/completed", params: { threadId: "thread", turn: { id: "other" } } }, "source");
    expect(await cache.workspaces.transitions.getForThread("thread")).not.toBeNull();
    await service.reconcileWorkspace("B");
    expect((await cache.workspaces.getForThread("thread"))?.id).toBe("B");
    expect(await cache.workspaces.transitions.getForThread("thread")).toBeNull();
  });

  it("should keep mismatched remote permissions blocked even when Codex reports idle", async () => {
    client.resumeThread.mockResolvedValue({ ...expectation(), cwd: "/A", thread: {
      id: "thread", status: { type: "idle" }, canAcceptDirectInput: true
    } });
    await expect(service.select("thread", "B")).rejects.toThrow("destination directory");
    await expect(service.reconcile("thread")).rejects.toThrow("destination directory");
    expect(await cache.workspaces.transitions.getForThread("thread")).toMatchObject({ state: "uncertain" });
    expect((await cache.workspaces.getForThread("thread"))?.id).toBe(originalId);
  });

  it("should refuse a different permission contract during explicit recovery", async () => {
    client.resumeThread.mockRejectedValueOnce(new Error("connection lost"));
    await expect(service.select("thread", "B")).rejects.toThrow("connection lost");
    preparation.prepare.mockResolvedValue({ ...expectation(), approvalPolicy: "on-request" });
    await expect(service.reconcile("thread")).rejects.toThrow("contract changed");
    expect(client.resumeThread).toHaveBeenCalledTimes(1);
    expect(await cache.workspaces.transitions.getForThread("thread")).toMatchObject({ state: "uncertain" });
  });

  it("should cancel interrupted preparation without making source calls", async () => {
    await cache.workspaces.transitions.begin("thread", "B");
    await service.reconcile("thread");
    expect(await cache.workspaces.transitions.getForThread("thread")).toBeNull();
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should hold the same thread gate across selection, starts and reconciliation", async () => {
    let proceed!: () => void;
    const blocked = new Promise<void>((resolve) => { proceed = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    preparation.prepare.mockImplementationOnce(async () => {
      entered();
      await blocked;
      return expectation();
    });
    const selecting = service.select("thread", "B");
    await started;
    try {
      await expect(service.select("thread", "B")).rejects.toThrow("operation in progress");
      await expect(service.reconcileWorkspace("B")).rejects.toThrow("operation in progress");
      await expect(service.run({ threadId: "thread", projectPath: null, sourceId: null }, vi.fn()))
        .rejects.toThrow("operation in progress");
    } finally {
      proceed();
      await selecting;
    }
  });
});
