import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV44 } from "../src/sqlite/migrations/v44";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

describe("atomic relocation and durable conversation reloads", () => {
  let database: Database.Database;
  let repository: SqliteWorkspaceCacheRepository;
  let workspaceId: string;
  let projectId: string;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    repository = new SqliteWorkspaceCacheRepository(database);
    const workspace = await repository.resolvePath("/repo", "source");
    workspaceId = workspace.id;
    projectId = workspace.projectId;
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/repo', ?, 'Retained')`).run(projectId, workspaceId);
  });
  afterEach(() => database.close());

  it("should retain IDs and immutable turn paths while journaling existing conversations only", async () => {
    const reservation = await repository.reserve(workspaceId, "thread");
    await repository.submitting(reservation.id);
    await repository.acknowledge(reservation.id, "turn");
    await repository.observeTurn("source", "thread", "turn", true);
    await repository.relocate(workspaceId, "/moved", "/repo");
    expect(await repository.getForThread("thread")).toMatchObject({ id: workspaceId, projectId, path: "/moved" });
    expect(await repository.listTurnContexts("thread")).toMatchObject([{ cwd: "/repo", workspaceId }]);
    expect(await repository.getThreadRelocationPath("thread")).toBe("/repo");
    expect(await repository.getThreadRelocationPath("new-thread")).toBeNull();
    expect(await repository.listPathAliases(workspaceId)).toEqual(["/repo"]);
    await repository.confirmThreadRelocation("thread", workspaceId, "/wrong");
    expect(await repository.getThreadRelocationPath("thread")).toBe("/repo");
    await repository.confirmThreadRelocation("thread", workspaceId, "/moved");
    expect(await repository.getThreadRelocationPath("thread")).toBeNull();
  });

  it("should migrate version 43 data idempotently without inventing relocated conversations", async () => {
    database.exec("DROP TABLE workspace_thread_relocations; DELETE FROM schema_migrations WHERE version = 44;");
    applySchemaMigrationV44(database);
    applySchemaMigrationV44(database);
    expect(await repository.getThreadRelocationPath("thread")).toBeNull();
    expect((await repository.getForThread("thread"))?.id).toBe(workspaceId);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should reject an intervening path change and leave aliases and conversations untouched", async () => {
    await expect(repository.relocate(workspaceId, "/moved", "/stale")).rejects.toThrow("path changed");
    expect(await repository.listPathAliases(workspaceId)).toEqual([]);
    expect(await repository.getThreadRelocationPath("thread")).toBeNull();
  });

  it("should reject relocation while either direction of a transition is unresolved", async () => {
    await repository.registerDiscovered(workspaceId, "source", "/repo", ["/secondary"]);
    const secondary = (await repository.list(projectId)).find(item => !item.isPrimary)!;
    await repository.transitions.begin("thread", secondary.id);
    await expect(repository.relocate(workspaceId, "/moved")).rejects.toThrow("unresolved transition");
    await expect(repository.relocate(secondary.id, "/elsewhere")).rejects.toThrow("unresolved transition");
  });

  it("should reject native Windows path collisions independent of case and separators", async () => {
    await repository.resolvePath("C:\\Occupied", "source");
    await expect(repository.relocate(workspaceId, "c:/occupied")).rejects.toThrow("already owns");
    expect(await repository.listPathAliases(workspaceId)).toEqual([]);
  });

  it("should reject pending project creation before changing the primary repository path", async () => {
    await repository.creations.begin({ primaryWorkspaceId: workspaceId, sourceId: "source", projectPath: "/repo",
      repositoryPath: "/repo/.git", destinationPath: "/secondary", start: { mode: "detached", startPoint: "HEAD" } });
    await expect(repository.relocate(workspaceId, "/moved")).rejects.toThrow("pending creation");
  });
});
