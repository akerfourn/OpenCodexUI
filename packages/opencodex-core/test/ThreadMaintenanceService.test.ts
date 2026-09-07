import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository, type OpenCodexCacheRepository } from
  "@open-codex-ui/opencodex-cache";
import { WorkspaceExecutionService } from "../src/backend/workspaces/WorkspaceExecutionService";
import { ThreadMaintenanceService } from "../src/backend/threads/ThreadMaintenanceService";
import { ThreadTurnCache } from "../src/ThreadTurnCache";
import type { ThreadTurnActionsServiceOptions } from "../src/backend/threads/ThreadTurnActionsService";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

describe("guarded thread maintenance", () => {
  let directory: string;
  let cache: OpenCodexCacheRepository;
  let workspaceId: string;
  let execution: WorkspaceExecutionService;
  let maintenance: ThreadMaintenanceService;
  const client = { readThread: vi.fn(), getMetadata: vi.fn(), resumeThread: vi.fn(),
    startReview: vi.fn(), compactThread: vi.fn(), rollbackThread: vi.fn() };
  const clients = { ensureClient: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "thread-maintenance-"));
    cache = createOpenCodexSqliteCacheRepository({ directory });
    const workspace = await cache.workspaces.resolvePath("/source/repo", "source");
    workspaceId = workspace.id;
    const db = new Database(path.join(directory, "opencodex-cache.sqlite"));
    try {
      db.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
        VALUES ('thread', ?, 'source', '/source/repo', ?, 'test')`).run(workspace.projectId, workspaceId);
    } finally {
      db.close();
    }
    client.readThread.mockResolvedValue({ thread: { id: "thread", status: { type: "idle" } } });
    client.getMetadata.mockResolvedValue({ isDirectory: true });
    client.resumeThread.mockResolvedValue({ cwd: "/source/repo", thread: {
      id: "thread", canAcceptDirectInput: true, status: { type: "idle" }
    } });
    client.startReview.mockResolvedValue({ reviewThreadId: "thread", turn: { id: "review-turn" } });
    client.compactThread.mockResolvedValue({});
    client.rollbackThread.mockResolvedValue({ thread: { id: "thread", cwd: "/source/repo", turns: [] } });
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    execution = new WorkspaceExecutionService(cache.workspaces, clients);
    maintenance = new ThreadMaintenanceService({
      workspaceExecution: execution, clients, backendOptions: { projectPath: "/wrong-default" },
      threadTurnCache: new ThreadTurnCache(),
      threadCacheService: { readTurns: vi.fn(() => []), writeSnapshot: vi.fn() },
      collaborationService: { reconcileTurns: vi.fn() }, events: { emit: vi.fn() }
    } as unknown as ThreadTurnActionsServiceOptions);
  });

  afterEach(async () => {
    await cache.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should resume review with persisted source/cwd and wait for review completion", async () => {
    await maintenance.startReview("thread", null);
    expect(client.resumeThread).toHaveBeenCalledWith("thread", expect.objectContaining({ cwd: "/source/repo" }));
    expect(clients.ensureClient).toHaveBeenCalledWith("source");
    expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
      { operation: "review", turnId: "review-turn" }
    ]);
    await execution.observe({ method: "turn/completed", params: { threadId: "thread", turn: { id: "review-turn" } } }, "source");
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect(await cache.workspaces.listTurnContexts("thread")).toEqual([]);
  });

  it("should not treat compaction acceptance as completion", async () => {
    await maintenance.compactThread("thread", null);
    expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([{ operation: "compact" }]);
    await expect(execution.run({ threadId: "thread", sourceId: null, projectPath: null }, vi.fn()))
      .rejects.toThrow("unresolved workspace execution");
    await execution.reconcile("thread");
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
  });

  it("should release rollback only after cache synchronization", async () => {
    await maintenance.editLastTurn("thread", null, null, null, null);
    expect(client.rollbackThread).toHaveBeenCalledWith({ threadId: "thread", numTurns: 1 });
    expect(await cache.workspaces.listReservations(workspaceId)).toEqual([]);
    expect(await cache.workspaces.listTurnContexts("thread")).toEqual([]);
  });

  it.each(["review", "compact", "rollback"] as const)("should block %s before RPC when a transition is pending", async (operation) => {
    await cache.workspaces.transitions.begin("thread", workspaceId);
    const actions = {
      review: () => maintenance.startReview("thread", null),
      compact: () => maintenance.compactThread("thread", null),
      rollback: () => maintenance.editLastTurn("thread", null, null, null, null)
    };
    await expect(actions[operation]()).rejects.toThrow("unresolved transition");
    expect(client.resumeThread).not.toHaveBeenCalled();
    expect(client.startReview).not.toHaveBeenCalled();
    expect(client.compactThread).not.toHaveBeenCalled();
    expect(client.rollbackThread).not.toHaveBeenCalled();
  });

  it("should preserve a lost rollback response across cache reopening", async () => {
    client.rollbackThread.mockRejectedValue(new Error("response lost"));
    await expect(maintenance.editLastTurn("thread", null, null, null, null)).rejects.toThrow("response lost");
    await cache.close();
    cache = createOpenCodexSqliteCacheRepository({ directory });
    expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([
      { operation: "rollback", state: "uncertain" }
    ]);
  });

  it("should reject contradictory paths before contacting the source", async () => {
    await expect(maintenance.startReview("thread", "/other")).rejects.toThrow("does not match");
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should not review a loaded thread whose resume ignored the reserved cwd", async () => {
    client.resumeThread.mockResolvedValue({ cwd: "/old", thread: {
      id: "thread", canAcceptDirectInput: true, status: { type: "idle" }
    } });
    await expect(maintenance.startReview("thread", null)).rejects.toThrow("reserved workspace");
    expect(client.startReview).not.toHaveBeenCalled();
    expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([{ state: "uncertain" }]);
  });

  it("should refuse a detached review response without claiming the original workspace context", async () => {
    client.startReview.mockResolvedValue({ reviewThreadId: "child", turn: { id: "review-turn" } });
    await expect(maintenance.startReview("thread", null)).rejects.toThrow("unexpected thread");
    expect(await cache.workspaces.listReservations(workspaceId)).toMatchObject([{ state: "uncertain" }]);
    expect(await cache.workspaces.listTurnContexts("thread")).toEqual([]);
  });
});
