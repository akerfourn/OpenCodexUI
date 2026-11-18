import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

// Build an authentic v53 database before exercising the new migration against retained journals.
vi.mock("../src/sqlite/migrations/v54", () => ({ applySchemaMigrationV54: vi.fn() }));
const { applySchemaMigrationV54 } = await vi.importActual<typeof import("../src/sqlite/migrations/v54")>(
  "../src/sqlite/migrations/v54");

describe("deferred deletion migration from v53", () => {
  it.each(["preparing", "uncertain"])("should preserve %s intent, history and every existing SQL guard", async state => {
    const database = new Database(":memory:");
    try {
      database.pragma("foreign_keys = ON");
      runMigrations(database);
      const workspaces = new SqliteWorkspaceCacheRepository(database);
      const primary = await workspaces.resolvePath("/repo", "source");
      const creation = await workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
        projectPath: primary.path, repositoryPath: "/repo/.git", destinationPath: "/secondary",
        start: { mode: "detached", startPoint: "HEAD" } });
      await workspaces.creations.submitting(creation.id, "a".repeat(40), null);
      await workspaces.creations.confirmGit(creation.id);
      const secondaryId = await workspaces.creations.commit(creation.id);
      // Use the old table directly: the current repository intentionally requires the v54 columns.
      database.prepare(`INSERT INTO workspace_removals
        (id, workspace_id, project_id, source_id, primary_workspace_id, project_path,
          workspace_path, repository_path, state, git_exit_code)
        VALUES ('retained', ?, ?, 'source', ?, '/repo', '/secondary', '/repo/.git', ?, NULL)`)
        .run(secondaryId, primary.projectId, primary.id, state);
      const previous = database.prepare("SELECT * FROM workspace_removals").get();
      const triggers = database.prepare(`SELECT name, sql FROM sqlite_master
        WHERE type = 'trigger' AND sql LIKE '%workspace_removals%' ORDER BY name`).all();

      applySchemaMigrationV54(database);
      applySchemaMigrationV54(database);

      expect(database.prepare("SELECT * FROM workspace_removals").get()).toEqual({ ...previous!,
        deferred_state: null, requested_at: null, blocked_reason: null });
      expect(database.prepare(`SELECT name, sql FROM sqlite_master
        WHERE type = 'trigger' AND sql LIKE '%workspace_removals%' ORDER BY name`).all()).toEqual(triggers);
      expect(await workspaces.removals.get("retained")).toMatchObject({ id: "retained", state, gitExitCode: null });
      expect(await workspaces.removals.queued()).toEqual([]);
      await expect(workspaces.reserve(secondaryId, null)).rejects.toThrow("pending removal");
      await expect(workspaces.relocate(primary.id, "/moved")).rejects.toThrow("pending removal");
      expect(database.pragma("foreign_key_check")).toEqual([]);
    } finally {
      database.close();
    }
  });
});
