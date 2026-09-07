import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

describe("new workspace conversation reservations", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;
  beforeEach(() => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
  });
  afterEach(() => database.close());

  it("should retain a dispatched creation whose thread identity was never received", async () => {
    const workspace = await workspaces.resolvePath("/repo", "source");
    const reservation = await workspaces.reserve(workspace.id, null);
    await workspaces.submittingCreation(reservation.id);
    await workspaces.fail(reservation.id);
    expect(await workspaces.listReservations(workspace.id)).toEqual([
      expect.objectContaining({ id: reservation.id, state: "uncertain", threadId: null })
    ]);
    await expect(workspaces.confirmCreation(reservation.id, "unknown")).rejects.toThrow("does not match");
  });

  it("should release only a persisted thread in the exact reserved source and checkout", async () => {
    const workspace = await workspaces.resolvePath("/repo", "source");
    const reservation = await workspaces.reserve(workspace.id, null);
    await workspaces.submittingCreation(reservation.id);
    await expect(workspaces.confirmCreation(reservation.id, "new")).rejects.toThrow("does not match");
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('new', ?, 'source', '/repo', ?, 'new')`).run(workspace.projectId, workspace.id);
    await workspaces.confirmCreation(reservation.id, "new");
    expect(await workspaces.listReservations(workspace.id)).toEqual([]);
  });

  it("should keep ordinary turn submission restricted to a known thread", async () => {
    const workspace = await workspaces.resolvePath("/repo", "source");
    const reservation = await workspaces.reserve(workspace.id, null);
    await expect(workspaces.submitting(reservation.id)).rejects.toThrow("not ready");
    expect(await workspaces.listReservations(workspace.id)).toEqual([
      expect.objectContaining({ state: "preparing", threadId: null })
    ]);
  });
});
