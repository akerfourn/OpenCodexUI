import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV33 } from "../src/sqlite/migrations/v33";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

describe("workspace maintenance reservations", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;
  let workspaceId: string;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
    const workspace = await workspaces.resolvePath("/repo", "source");
    workspaceId = workspace.id;
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/repo', ?, 'test')`).run(workspace.projectId, workspaceId);
  });

  afterEach(() => database.close());

  it("should migrate existing turn reservations without losing their identity or state", async () => {
    const reserved = await workspaces.reserve(workspaceId, "thread");
    await workspaces.submitting(reserved.id);
    database.exec("ALTER TABLE workspace_execution_reservations DROP COLUMN operation; DELETE FROM schema_migrations WHERE version = 33;");
    applySchemaMigrationV33(database);
    applySchemaMigrationV33(database);
    expect(await workspaces.listReservations(workspaceId)).toEqual([
      { ...reserved, state: "submitting", operation: "turn" }
    ]);
  });

  it.each(["review", "compact"] as const)("should keep accepted %s reserved until matching completion", async (operation) => {
    const reserved = await workspaces.reserve(workspaceId, "thread", operation);
    await workspaces.submitting(reserved.id);
    await workspaces.acknowledgeMaintenance(reserved.id, operation === "review" ? "turn" : undefined);
    await expect(workspaces.transitions.begin("thread", workspaceId)).rejects.toThrow("unresolved execution");
    await workspaces.observeTurn("other-source", "thread", "turn", true);
    expect(await workspaces.listReservations(workspaceId)).toHaveLength(1);
    await workspaces.observeTurn("source", "thread", "turn", false);
    await workspaces.observeTurn("source", "thread", "old-turn", true);
    expect(await workspaces.listReservations(workspaceId)).toHaveLength(1);
    await workspaces.observeTurn("source", "thread", "turn", true);
    expect(await workspaces.listReservations(workspaceId)).toEqual([]);
    expect(await workspaces.listTurnContexts("thread")).toEqual([]);
  });

  it.each(["review", "compact"] as const)("should retain early %s completion until RPC acknowledgement", async (operation) => {
    const reserved = await workspaces.reserve(workspaceId, "thread", operation);
    await workspaces.submitting(reserved.id);
    await workspaces.observeTurn("source", "thread", "turn", false);
    await workspaces.observeTurn("source", "thread", "turn", true);
    expect(await workspaces.listReservations(workspaceId)).toMatchObject([{ state: "completed" }]);
    await workspaces.acknowledgeMaintenance(reserved.id, operation === "review" ? "turn" : undefined);
    expect(await workspaces.listReservations(workspaceId)).toEqual([]);
    expect(await workspaces.listTurnContexts("thread")).toEqual([]);
  });

  it("should ignore turn events during rollback and release only after synchronous success", async () => {
    const reserved = await workspaces.reserve(workspaceId, "thread", "rollback");
    await workspaces.submitting(reserved.id);
    await workspaces.observeTurn("source", "thread", "unrelated", false);
    await workspaces.observeTurn("source", "thread", "unrelated", true);
    expect(await workspaces.listReservations(workspaceId)).toMatchObject([{ state: "submitting", turnId: null }]);
    await workspaces.acknowledgeMaintenance(reserved.id);
    expect(await workspaces.listReservations(workspaceId)).toEqual([]);
    expect(await workspaces.listTurnContexts("thread")).toEqual([]);
  });

  it("should reject review responses without an id and preserve uncertainty after failure", async () => {
    const reserved = await workspaces.reserve(workspaceId, "thread", "review");
    await workspaces.submitting(reserved.id);
    await expect(workspaces.acknowledgeMaintenance(reserved.id)).rejects.toThrow("no turn id");
    await workspaces.fail(reserved.id);
    expect(await workspaces.listReservations(workspaceId)).toMatchObject([{ state: "uncertain" }]);
  });
});
