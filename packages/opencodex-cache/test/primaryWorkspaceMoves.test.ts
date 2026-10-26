import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import type { WorkspaceMoveInput } from "../src/types/workspaceMoves";

describe("primary-directory move persistence", () => {
  let database: Database.Database;
  let repository: SqliteWorkspaceCacheRepository;
  let input: WorkspaceMoveInput;
  let nestedId: string;
  let externalId: string;
  beforeEach(async () => {
    database = new Database(":memory:"); database.pragma("foreign_keys = ON"); runMigrations(database);
    repository = new SqliteWorkspaceCacheRepository(database);
    const primary = await repository.resolvePath("/repo", "source");
    await repository.registerDiscovered(primary.id, "source", primary.path, ["/repo/child", "/outside"]);
    const members = await repository.list(primary.projectId);
    nestedId = members.find(item => item.path === "/repo/child")!.id;
    externalId = members.find(item => item.path === "/outside")!.id;
    input = { projectId: primary.projectId, workspaceId: primary.id, primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: "/repo", workspacePath: "/repo", destinationPath: "/new", repositoryPath: "/repo/.git",
      gitDirectory: "/repo/.git", expectedHead: "", expectedBranch: null, rootPath: null,
      primarySnapshot: { identity: "1:2:3", git: null, members: members.map(item => ({ workspaceId: item.id,
        path: item.path, destinationPath: item.path.replace(/^\/repo(?=\/|$)/u, "/new") })) } };
  });
  afterEach(() => database.close());

  it("should reserve every project workspace and both endpoint subtrees without prefix false positives", async () => {
    const move = await repository.moves.begin(input);
    expect((await repository.list(input.projectId)).every(item => item.movePending)).toBe(true);
    await expect(repository.reserve(externalId, null)).rejects.toThrow(/pending.*move/);
    await expect(repository.relocate(externalId, "/other")).rejects.toThrow(/pending.*move/);
    await expect(repository.resolvePath("/new/foreign", "source")).rejects.toThrow(/pending.*move/);
    await expect(repository.resolvePath("/repo/foreign", "source")).rejects.toThrow(/pending.*move/);
    expect((await repository.resolvePath("/repo-other", "source")).path).toBe("/repo-other");
    await repository.moves.cancel(move.id);
    expect((await repository.list(input.projectId)).every(item => !item.movePending)).toBe(true);
  });

  it("should reject an existing execution in an external secondary before reserving the primary move", async () => {
    await repository.reserve(externalId, null);
    await expect(repository.moves.begin(input)).rejects.toThrow("reserved");
    expect(await repository.moves.list(input.projectId)).toEqual([]);
  });

  it("should publish parent and nested aliases atomically while requiring external conversations to reload", async () => {
    for (const member of input.primarySnapshot!.members) {
      database.prepare(`INSERT INTO threads (id, project_id, source_id, current_workspace_id, cwd, title)
        VALUES (?, ?, 'source', ?, ?, 'Retained')`).run(`thread-${member.workspaceId}`, input.projectId, member.workspaceId, member.path);
    }
    const move = await repository.moves.begin(input);
    await repository.moves.submitting(move.id);
    await repository.moves.commit(move.id);
    expect((await repository.get(input.workspaceId))?.path).toBe("/new");
    expect((await repository.get(nestedId))?.path).toBe("/new/child");
    expect((await repository.get(externalId))?.path).toBe("/outside");
    expect(await repository.listPathAliases(input.workspaceId)).toContain("/repo");
    expect(await repository.listPathAliases(nestedId)).toContain("/repo/child");
    expect(await repository.getThreadRelocationPath(`thread-${externalId}`)).toBe("/outside");
    expect(await repository.getThreadRelocationPath(`thread-${nestedId}`)).toBe("/repo/child");
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should reject stale member snapshots and overlapping foreign projects before movement", async () => {
    input.primarySnapshot!.members.pop();
    await expect(repository.moves.begin(input)).rejects.toThrow("catalogue changed");
    expect(await repository.moves.list(input.projectId)).toEqual([]);
  });

  it("should preserve existing secondary recovery records when migration 48 runs again", async () => {
    const secondary: WorkspaceMoveInput = { ...input, workspaceId: nestedId, workspacePath: "/repo/child",
      destinationPath: "/target", expectedHead: "a".repeat(40), primarySnapshot: undefined };
    database.prepare("UPDATE project_workspaces SET managed = 1 WHERE id = ?").run(nestedId);
    const move = await repository.moves.begin(secondary);
    await repository.moves.submitting(move.id);
    database.exec("DELETE FROM schema_migrations WHERE version = 48");
    runMigrations(database); runMigrations(database);
    expect(await repository.moves.get(move.id)).toEqual({ ...move, state: "submitting" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 48").get()).toEqual({ count: 1 });
  });
});
