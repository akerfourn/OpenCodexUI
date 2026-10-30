import Database from "better-sqlite3";
import { expect, it } from "vitest";

import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV48 } from "../src/sqlite/migrations/v48";
import { applySchemaMigrationV50 } from "../src/sqlite/migrations/v50";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import type { WorkspaceMoveInput } from "../src/types/workspaceMoves";

it("should upgrade the previous move guard without losing pending operations or adopting imported workspaces", async () => {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  try {
    runMigrations(database);
    const repository = new SqliteWorkspaceCacheRepository(database);
    const primary = await repository.resolvePath("/repo", "source");
    await repository.registerDiscovered(primary.id, "source", primary.path, ["/managed", "/imported"]);
    const workspaces = await repository.list(primary.projectId);
    const managed = workspaces.find(item => item.path === "/managed")!;
    const imported = workspaces.find(item => item.path === "/imported")!;
    database.prepare("UPDATE project_workspaces SET managed = 1 WHERE id = ?").run(managed.id);
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/imported', ?, 'Retained')`).run(primary.projectId, imported.id);

    // Restore the real previous guard to exercise an existing database upgrade.
    database.exec("DELETE FROM schema_migrations WHERE version IN (48, 50)");
    applySchemaMigrationV48(database);
    const input: WorkspaceMoveInput = {
      projectId: primary.projectId, workspaceId: imported.id, primaryWorkspaceId: primary.id,
      sourceId: "source", projectPath: primary.path, workspacePath: imported.path, destinationPath: "/new-imported",
      rootPath: null, repositoryPath: "/repo/.git", gitDirectory: "/repo/.git/worktrees/imported",
      expectedHead: "a".repeat(40), expectedBranch: null
    };
    await expect(repository.moves.begin(input)).rejects.toThrow("Move identity");
    const pending = await repository.moves.begin({ ...input, workspaceId: managed.id, workspacePath: managed.path,
      destinationPath: "/new-managed", gitDirectory: "/repo/.git/worktrees/managed" });
    await repository.moves.submitting(pending.id);
    await repository.moves.confirmGit(pending.id, 1);
    await repository.moves.fail(pending.id);
    const previousWorkspaces = await repository.list(primary.projectId);
    const previousThreads = database.prepare("SELECT * FROM threads").all();
    const previousMoves = await repository.moves.list(primary.projectId);

    applySchemaMigrationV50(database);
    applySchemaMigrationV50(database);
    expect(await repository.list(primary.projectId)).toEqual(previousWorkspaces);
    expect(database.prepare("SELECT * FROM threads").all()).toEqual(previousThreads);
    expect(await repository.moves.list(primary.projectId)).toEqual(previousMoves);
    await expect(repository.reserve(managed.id, null)).rejects.toThrow("pending move");

    await repository.moves.cancel(pending.id);
    const move = await repository.moves.begin(input);
    expect(await repository.get(imported.id)).toMatchObject({ managed: false, movePending: true });
    expect(move.workspaceId).toBe(imported.id);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  } finally {
    database.close();
  }
});
