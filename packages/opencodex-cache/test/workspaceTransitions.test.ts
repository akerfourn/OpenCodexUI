import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import { clearSourceAssociations } from "../src/sqlite/sources/sourceQueries";
import { applySchemaMigrationV32 } from "../src/sqlite/migrations/v32";

describe("durable workspace transitions", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;
  let originalId: string;
  let projectId: string;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
    const original = await workspaces.resolvePath("/A", "source");
    originalId = original.id;
    projectId = original.projectId;
    database.prepare(`INSERT INTO project_workspaces
      (id, project_id, source_id, source_key, path) VALUES ('B', ?, 'source', 'source', '/B')`).run(projectId);
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/A', ?, 'test')`).run(projectId, originalId);
  });

  afterEach(() => database.close());

  it("should preserve existing identity and execution reservations when migrating version 31 twice", async () => {
    database.exec(`DROP TRIGGER protect_transition_execution; DROP TRIGGER protect_transition_workspace;
      DROP TRIGGER protect_transition_thread; DROP TABLE workspace_transitions;
      DELETE FROM schema_migrations WHERE version = 32;`);
    const execution = await workspaces.reserve(originalId, "thread");
    applySchemaMigrationV32(database);
    applySchemaMigrationV32(database);
    expect(await workspaces.listReservations(originalId)).toEqual([execution]);
    expect((await workspaces.getForThread("thread"))?.id).toBe(originalId);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("should protect both locations and source removal without changing the selected workspace", async () => {
    await workspaces.transitions.begin("thread", "B");
    expect((await workspaces.getForThread("thread"))?.id).toBe(originalId);
    for (const id of [originalId, "B"]) {
      await expect(workspaces.reserve(id, null)).rejects.toThrow("unresolved transition");
      await expect(workspaces.relocate(id, "/moved")).rejects.toThrow("unresolved transition");
    }
    await expect(workspaces.select("thread", "B")).rejects.toThrow("unresolved workspace transition");
    expect(() => database.prepare("DELETE FROM threads WHERE id = 'thread'").run()).toThrow("FOREIGN KEY");
    expect(() => database.prepare("DELETE FROM projects WHERE id = ?").run(projectId)).toThrow("FOREIGN KEY");
    await expect(clearSourceAssociations(database, "source")).rejects.toThrow("unresolved workspace executions");
  });

  it("should reject competing executions, transitions and cross-source destinations", async () => {
    const execution = await workspaces.reserve("B", null);
    await expect(workspaces.transitions.begin("thread", "B")).rejects.toThrow("unresolved execution");
    await workspaces.fail(execution.id);
    const foreign = await workspaces.resolvePath("/other", "other-source");
    await expect(workspaces.transitions.begin("thread", foreign.id)).rejects.toThrow("project and source");
    await workspaces.transitions.begin("thread", "B");
    await expect(workspaces.transitions.begin("thread", "B")).rejects.toThrow("unresolved execution");
  });

  it("should never release a transition in response to turn notifications or execution reconciliation", async () => {
    const transition = await workspaces.transitions.begin("thread", "B");
    await workspaces.transitions.submitting(transition.id, '{"cwd":"/B"}');
    await workspaces.observeTurn("source", "thread", "unrelated-turn", false);
    await workspaces.observeTurn("source", "thread", "unrelated-turn", true);
    await workspaces.release(transition.id);
    expect(await workspaces.transitions.getForThread("thread")).toMatchObject({ state: "submitting" });
    expect(await workspaces.listTurnContexts("thread")).toEqual([]);
  });

  it("should cancel preparation but retain a dispatched failure until verified commit", async () => {
    const first = await workspaces.transitions.begin("thread", "B");
    await expect(workspaces.transitions.commit(first.id)).rejects.toThrow("not been submitted");
    await workspaces.transitions.fail(first.id);
    expect(await workspaces.transitions.getForThread("thread")).toBeNull();
    const second = await workspaces.transitions.begin("thread", "B");
    await workspaces.transitions.submitting(second.id, '{"cwd":"/B"}');
    await workspaces.transitions.fail(second.id);
    expect(await workspaces.transitions.getForThread("thread")).toMatchObject({ state: "uncertain" });
    await expect(workspaces.transitions.submitting(second.id, '{"cwd":"/C"}'))
      .rejects.toThrow("expectation changed");
    await workspaces.transitions.submitting(second.id, '{"cwd":"/B"}');
    await workspaces.transitions.commit(second.id);
    expect(await workspaces.transitions.list(originalId)).toEqual([]);
    expect((await workspaces.getForThread("thread"))?.id).toBe("B");
    expect(database.prepare("SELECT cwd FROM threads WHERE id = 'thread'").get()).toEqual({ cwd: "/B" });
  });

  it("should roll back blocker deletion if selecting the destination fails", async () => {
    const transition = await workspaces.transitions.begin("thread", "B");
    await workspaces.transitions.submitting(transition.id, "{}");
    database.exec(`CREATE TRIGGER fail_commit BEFORE UPDATE OF current_workspace_id ON threads
      BEGIN SELECT RAISE(ABORT, 'simulated disk failure'); END;`);
    await expect(workspaces.transitions.commit(transition.id)).rejects.toThrow("simulated disk failure");
    expect(await workspaces.transitions.getForThread("thread")).toMatchObject({ id: transition.id });
    expect((await workspaces.getForThread("thread"))?.id).toBe(originalId);
  });
});
