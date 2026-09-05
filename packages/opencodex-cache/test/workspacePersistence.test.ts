import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import { upsertProject } from "../src/sqlite/projects/projectQueries";
import { writeThreadIndex } from "../src/sqlite/threads/threadIndexWriter";
import { clearSourceAssociations } from "../src/sqlite/sources/sourceQueries";
import type { CachedThreadSummary } from "../src/types";

import { deleteEmptyUnsyncedThreads } from "../src/sqlite/threads/threadIndexQueries";
import { writeTurns } from "../src/sqlite/threads/turnQueries";
import { getThread, getOlderTurns } from "../src/sqlite/threads/threadSnapshotQueries";

describe("workspace persistence", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;

  beforeEach(() => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
  });

  afterEach(() => database.close());

  it("should preserve legacy IDs and associations when migrating twice", async () => {
    database.exec(`
      DROP TABLE turn_workspace_contexts;
      DROP TRIGGER delete_thread_workspace_contexts;
      DROP TABLE workspace_execution_reservations;
      ALTER TABLE threads DROP COLUMN current_workspace_id;
      DROP TABLE workspace_path_aliases;
      DROP TABLE project_workspaces;
      DELETE FROM schema_migrations WHERE version >= 28;
      INSERT INTO projects (id, source_id, source_key, path, default_name,
        display_name, created_at, updated_at, last_seen_at)
      VALUES ('legacy-hash', 'source-a', 'source-a', '/repo', 'repo',
        'Custom project', '2026-01-01', '2026-01-01', '2026-01-01');
      INSERT INTO threads (id, project_id, source_id, cwd, title)
      VALUES ('legacy-thread', 'legacy-hash', 'source-a', '/repo', 'Keep title');
    `);

    runMigrations(database);
    runMigrations(database);

    expect(await workspaces.list("legacy-hash")).toEqual([{
      id: "primary:legacy-hash", projectId: "legacy-hash", sourceId: "source-a",
      path: "/repo", isPrimary: true, managed: false, removedAt: null
    }]);
    expect(await workspaces.getForThread("legacy-thread")).toMatchObject({ projectId: "legacy-hash" });
    expect(database.prepare("SELECT id, display_name FROM projects").all()).toEqual([
      { id: "legacy-hash", display_name: "Custom project" }
    ]);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("should share UUID project identity between creation and thread indexing", async () => {
    const project = await upsertProject(database, "/repo", "source-a");
    writeThreadIndex(database, [thread()]);

    expect(project.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect(await workspaces.getForThread("thread-a")).toMatchObject({ projectId: project.id });
    expect(database.prepare("SELECT COUNT(*) AS count FROM projects").get()).toEqual({ count: 1 });
  });

  it("should preserve identity after relocation and ignore stale indexed paths", async () => {
    writeThreadIndex(database, [thread()]);
    const original = (await workspaces.getForThread("thread-a"))!;
    await workspaces.relocate(original.id, "/moved");
    writeThreadIndex(database, [thread()]);

    expect(await workspaces.getForThread("thread-a")).toEqual({ ...original, path: "/moved" });
    expect((await upsertProject(database, "/moved", "source-a")).id).toBe(original.projectId);
    expect(database.prepare("SELECT cwd FROM threads WHERE id = 'thread-a'").get())
      .toEqual({ cwd: "/moved" });
    expect(database.prepare("SELECT path FROM workspace_path_aliases").all()).toEqual([{ path: "/repo" }]);
  });

  it("should create a distinct project when a historical alias is reused", async () => {
    const original = await workspaces.resolvePath("/repo", "source-a");
    await workspaces.relocate(original.id, "/moved");
    const reused = await workspaces.resolvePath("/repo", "source-a");

    expect(reused.projectId).not.toBe(original.projectId);
    expect((await workspaces.get(original.id))?.path).toBe("/moved");
  });

  it("should resolve a historical source discriminator without rewriting the project ID", async () => {
    const original = await workspaces.resolvePath("/repo", "source-a");
    database.prepare("UPDATE projects SET source_key = 'legacy-source-key' WHERE id = ?")
      .run(original.projectId);
    database.prepare("UPDATE project_workspaces SET source_key = 'legacy-source-key' WHERE id = ?")
      .run(original.id);

    expect((await upsertProject(database, "/repo", "source-a")).id).toBe(original.projectId);
    expect(await workspaces.resolvePath("/repo", "source-a")).toEqual(original);
  });

  it("should preserve source-local Windows and Unicode paths", async () => {
    const workspace = await workspaces.resolvePath("C:\\Workspaces\\projet été", "source-windows");
    const repeated = await workspaces.resolvePath("C:/Workspaces/projet été", "source-windows");
    const remote = await workspaces.resolvePath("/home/projet été", "source-linux");

    expect(repeated).toEqual(workspace);
    expect(workspace.path).toBe("C:\\Workspaces\\projet été");
    expect(remote.path).toBe("/home/projet été");
  });

  it("should keep same paths in separate sources and preserve orphan workspaces", async () => {
    const first = await workspaces.resolvePath("/repo", "source-a");
    const second = await workspaces.resolvePath("/repo", "source-b");
    const orphan = await upsertProject(database, "/repo", null);

    expect(new Set([first.projectId, second.projectId, orphan.id]).size).toBe(3);
    const [workspace] = await workspaces.list(orphan.id);
    expect(workspace.sourceId).toBeNull();
    await expect(workspaces.reserve(workspace.id, null)).rejects.toThrow("no execution source");
  });

  it("should roll back a relocation that collides with another active path", async () => {
    const first = await workspaces.resolvePath("/repo", "source-a");
    await workspaces.resolvePath("/occupied", "source-a");

    await expect(workspaces.relocate(first.id, "/occupied")).rejects.toThrow("UNIQUE constraint");
    expect((await workspaces.get(first.id))?.path).toBe("/repo");
    expect(database.prepare("SELECT * FROM workspace_path_aliases").all()).toEqual([]);
  });

  it("should preserve a known association when metadata omits the path or conflicts on source", async () => {
    writeThreadIndex(database, [thread()]);
    const original = await workspaces.getForThread("thread-a");
    writeThreadIndex(database, [{ ...thread(), projectPath: null, sourceId: null }]);
    expect(await workspaces.getForThread("thread-a")).toEqual(original);

    expect(() => writeThreadIndex(database, [{ ...thread(), sourceId: "source-b" }]))
      .toThrow("Thread source conflicts");
    expect(await workspaces.getForThread("thread-a")).toEqual(original);
  });

  it("should block selection, relocation and project deletion while reserved", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");

    await expect(workspaces.select("thread-a", workspace.id)).rejects.toThrow("reserved or active");
    await expect(workspaces.relocate(workspace.id, "/moved")).rejects.toThrow("reserved or active");
    expect(() => database.prepare("DELETE FROM projects WHERE id = ?").run(workspace.projectId))
      .toThrow("FOREIGN KEY constraint");
    await workspaces.fail(reservation.id);
    await expect(workspaces.select("thread-a", workspace.id)).resolves.toBeUndefined();
  });

  it("should reject a second reservation and cross-project selection", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const other = await workspaces.resolvePath("/other", "source-a");

    await expect(workspaces.select("thread-a", other.id)).rejects.toThrow("same project and source");
    await workspaces.reserve(workspace.id, "thread-a");
    await expect(workspaces.reserve(workspace.id, "thread-a")).rejects.toThrow("unresolved workspace execution");
  });

  it("should guard source removal and keep an orphan workspace readable afterwards", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");
    await expect(clearSourceAssociations(database, "source-a")).rejects.toThrow("unresolved workspace executions");
    await workspaces.fail(reservation.id);
    await clearSourceAssociations(database, "source-a");

    expect(await workspaces.getForThread("thread-a")).toEqual({ ...workspace, sourceId: null });
    await expect(workspaces.reserve(workspace.id, "thread-a")).rejects.toThrow("no execution source");
  });

  it("should retain a lost response as uncertain across repository recreation", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(reservation.id);
    await workspaces.fail(reservation.id);
    const reopened = new SqliteWorkspaceCacheRepository(database);

    expect(await reopened.listReservations(workspace.id)).toEqual([
      { ...reservation, state: "uncertain" }
    ]);
    await expect(reopened.select("thread-a", workspace.id)).rejects.toThrow("reserved or active");
  });

  it("should retain early completion until the RPC response is acknowledged", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(reservation.id);
    await workspaces.observeTurn("source-a", "thread-a", "turn-a", false);
    await workspaces.observeTurn("source-a", "thread-a", "turn-a", true);

    expect(await workspaces.listReservations(workspace.id)).toEqual([
      { ...reservation, turnId: "turn-a", state: "completed" }
    ]);
    await expect(workspaces.select("thread-a", workspace.id)).rejects.toThrow("reserved or active");
    await workspaces.acknowledge(reservation.id, "turn-a");
    expect(await workspaces.listReservations(workspace.id)).toEqual([]);
  });

  it("should retain historical cwd through sync, rollback, relocation and source removal", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(reservation.id);
    await workspaces.observeTurn("source-a", "thread-a", "turn-a", false);
    await workspaces.observeTurn("source-a", "thread-a", "turn-a", true);
    await workspaces.acknowledge(reservation.id, "turn-a");
    const context = {
      sourceId: "source-a", threadId: "thread-a", turnId: "turn-a",
      projectId: workspace.projectId, workspaceId: workspace.id, cwd: "/repo"
    };
    await workspaces.relocate(workspace.id, "/moved");
    writeTurns(database, "thread-a", [
      { id: "turn-a", startedAt: 1, items: [], openCodexUiWorkspace: { cwd: "/forged" } },
      { id: "turn-b", startedAt: 2, items: [] }
    ]);
    expect((await getThread(database, "thread-a"))?.turns[0])
      .toMatchObject({ openCodexUiWorkspace: context });
    expect((await getOlderTurns(database, {
      threadId: "thread-a", beforeTurnId: "turn-b", limit: 1
    })).turns[0]).toMatchObject({ openCodexUiWorkspace: context });

    database.prepare("DELETE FROM turns WHERE thread_id = ?").run("thread-a");
    expect(await workspaces.listTurnContexts("thread-a")).toEqual([context]);
    writeTurns(database, "thread-a", [{ id: "turn-a", items: [] }]);
    await clearSourceAssociations(database, "source-a");
    expect((await getThread(database, "thread-a"))?.turns[0])
      .toMatchObject({ openCodexUiWorkspace: context });
    database.prepare("DELETE FROM threads WHERE id = ?").run("thread-a");
    expect(await workspaces.listTurnContexts("thread-a")).toEqual([]);
  });

  it("should leave legacy and externally spawned turns unknown instead of inferring their cwd", async () => {
    writeThreadIndex(database, [thread(), { ...thread(), id: "child", parentThreadId: "thread-a" }]);
    for (const threadId of ["thread-a", "child"]) {
      writeTurns(database, threadId, [{ id: "legacy", openCodexUiWorkspace: { cwd: "/repo" } }]);
      expect(await workspaces.listTurnContexts(threadId)).toEqual([]);
      expect((await getThread(database, threadId))?.turns[0])
        .not.toHaveProperty("openCodexUiWorkspace");
    }
  });

  it("should capture a new cwd for a new turn and reject conflicting reuse of an old turn ID", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const first = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(first.id);
    await workspaces.acknowledge(first.id, "turn-a");
    database.exec("UPDATE threads SET title = '', codex_title = '', custom_title = ''");
    expect(await deleteEmptyUnsyncedThreads(database, "/repo", "source-a")).toBe(0);
    await workspaces.observeTurn("source-a", "thread-a", "turn-a", true);
    await workspaces.relocate(workspace.id, "/moved");
    const second = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(second.id);
    await expect(workspaces.acknowledge(second.id, "turn-a"))
      .rejects.toThrow("conflicts with immutable execution history");
    await workspaces.acknowledge(second.id, "turn-b");
    expect(await workspaces.listTurnContexts("thread-a")).toEqual([
      expect.objectContaining({ turnId: "turn-a", cwd: "/repo" }),
      expect.objectContaining({ turnId: "turn-b", cwd: "/moved" })
    ]);
  });

  it("should migrate only correlated reservations and preserve them on repeated migration", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(reservation.id);
    await workspaces.acknowledge(reservation.id, "turn-a");
    database.exec("DROP TABLE turn_workspace_contexts; DELETE FROM schema_migrations WHERE version = 30");
    runMigrations(database);
    runMigrations(database);
    expect(await workspaces.listTurnContexts("thread-a")).toEqual([
      { sourceId: "source-a", threadId: "thread-a", turnId: "turn-a",
        projectId: workspace.projectId, workspaceId: workspace.id, cwd: "/repo" }
    ]);
  });

  it("should ignore completion from another source or another turn", async () => {
    writeThreadIndex(database, [thread()]);
    const workspace = (await workspaces.getForThread("thread-a"))!;
    const reservation = await workspaces.reserve(workspace.id, "thread-a");
    await workspaces.submitting(reservation.id);
    await workspaces.acknowledge(reservation.id, "turn-a");
    await workspaces.observeTurn("source-b", "thread-a", "turn-a", true);
    await workspaces.observeTurn("source-a", "thread-a", "old-turn", true);
    expect(await workspaces.listReservations(workspace.id)).toHaveLength(1);

    await workspaces.observeTurn("source-a", "thread-a", "turn-a", true);
    expect(await workspaces.listReservations(workspace.id)).toEqual([]);
  });
});

/** Minimal deterministic external thread metadata used to exercise real indexing. */
function thread(): CachedThreadSummary {
  return {
    id: "thread-a", sessionId: null, parentThreadId: null, sourceId: "source-a",
    projectPath: "/repo", projectName: "repo", title: "Thread", codexTitle: "Thread",
    customTitle: null, preview: "", model: null, reasoningEffort: null,
    branchName: null, updatedAt: null, isArchived: false, threadSource: null,
    agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
  };
}
