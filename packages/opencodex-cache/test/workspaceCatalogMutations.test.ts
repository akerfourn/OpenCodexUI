import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV33 } from "../src/sqlite/migrations/v33";
import { applySchemaMigrationV34 } from "../src/sqlite/migrations/v34";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

describe("durable catalog reservations", () => {
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

  it("should preserve version 33 reservations and their transition trigger during migration", async () => {
    database.exec(`ALTER TABLE workspace_execution_reservations DROP COLUMN operation;
      DELETE FROM schema_migrations WHERE version IN (33, 34);`);
    applySchemaMigrationV33(database);
    const reservation = await workspaces.reserve(workspaceId, "thread", "review");
    await workspaces.submitting(reservation.id);
    await workspaces.acknowledgeMaintenance(reservation.id, "turn");
    const previous = database.prepare("SELECT * FROM workspace_execution_reservations").all();

    applySchemaMigrationV34(database);
    applySchemaMigrationV34(database);

    expect(database.prepare("SELECT * FROM workspace_execution_reservations").all()).toEqual(previous);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    await workspaces.release(reservation.id);
    await workspaces.transitions.begin("thread", workspaceId);
    await expect(workspaces.reserve(workspaceId, "thread", "archive")).rejects.toThrow(
      "unresolved transition"
    );
  });

  it.each(["archive", "unarchive", "delete"] as const)(
    "should retain dispatched %s despite unrelated turn notifications",
    async (operation) => {
      const reservation = await workspaces.reserve(workspaceId, "thread", operation);
      await workspaces.submitting(reservation.id);
      await workspaces.fail(reservation.id);

      await workspaces.observeTurn("source", "thread", "turn", false);
      await workspaces.observeTurn("source", "thread", "turn", true);
      await expect(workspaces.acknowledge(reservation.id, "turn")).rejects.toThrow(
        "does not match"
      );
      await expect(workspaces.acknowledgeMaintenance(reservation.id)).rejects.toThrow(
        "not ready"
      );

      expect(await workspaces.listReservations(workspaceId)).toEqual([
        { ...reservation, state: "uncertain" }
      ]);
      expect(await workspaces.listTurnContexts("thread")).toEqual([]);
      await expect(workspaces.relocate(workspaceId, "/moved")).rejects.toThrow("reserved or active");
      await expect(workspaces.transitions.begin("thread", workspaceId)).rejects.toThrow(
        "unresolved execution"
      );
    }
  );

  it("should retain positive deletion evidence independently of the cached thread", async () => {
    const reservation = await workspaces.reserve(workspaceId, "thread", "delete");
    await expect(workspaces.confirmDeletion(reservation.id)).rejects.toThrow("not ready");
    await workspaces.submitting(reservation.id);
    await workspaces.confirmDeletion(reservation.id);
    await workspaces.confirmDeletion(reservation.id);
    database.prepare("DELETE FROM threads WHERE id = ?").run("thread");
    await workspaces.fail(reservation.id);
    await workspaces.observeTurn("source", "thread", "unrelated", true);

    expect(await workspaces.isDeletionConfirmed(reservation.id)).toBe(true);
    expect(await workspaces.getReservationForThread("thread")).toMatchObject({
      id: reservation.id, state: "uncertain", operation: "delete"
    });
    await workspaces.release(reservation.id);
    expect(await workspaces.getReservationForThread("thread")).toBeNull();
    expect(await workspaces.isDeletionConfirmed(reservation.id)).toBe(false);
  });

  it("should reject deletion confirmation for a different operation", async () => {
    const reservation = await workspaces.reserve(workspaceId, "thread", "archive");
    await workspaces.submitting(reservation.id);

    await expect(workspaces.confirmDeletion(reservation.id)).rejects.toThrow("not ready");
    expect(await workspaces.isDeletionConfirmed(reservation.id)).toBe(false);
  });

  it("should preserve deletion intent after the local thread has been removed", async () => {
    const reservation = await workspaces.reserve(workspaceId, "thread", "delete");
    await workspaces.submitting(reservation.id);
    database.prepare("DELETE FROM threads WHERE id = ?").run("thread");
    await workspaces.fail(reservation.id);

    expect(await workspaces.listReservations(workspaceId)).toMatchObject([
      { threadId: "thread", operation: "delete", state: "uncertain" }
    ]);
    await expect(workspaces.relocate(workspaceId, "/moved")).rejects.toThrow("reserved or active");
  });
});
