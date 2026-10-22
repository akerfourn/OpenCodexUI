import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV45 } from "../src/sqlite/migrations/v45";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import type { WorkspaceMoveInput } from "../src/types/workspaceMoves";

describe("durable workspace movement", () => {
  let database: Database.Database;
  let repository: SqliteWorkspaceCacheRepository;
  let input: WorkspaceMoveInput;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    repository = new SqliteWorkspaceCacheRepository(database);
    const primary = await repository.resolvePath("/repo", "source");
    await repository.registerDiscovered(primary.id, "source", primary.path, ["/secondary"]);
    const secondary = (await repository.list(primary.projectId)).find(item => !item.isPrimary)!;
    database.prepare("UPDATE project_workspaces SET managed = 1 WHERE id = ?").run(secondary.id);
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/secondary', ?, 'Retained')`).run(primary.projectId, secondary.id);
    input = { projectId: primary.projectId, workspaceId: secondary.id, sourceId: "source", primaryWorkspaceId: primary.id,
      projectPath: "/repo", workspacePath: "/secondary", destinationPath: "/storage/destination", rootPath: null,
      repositoryPath: "/repo/.git", gitDirectory: "/repo/.git/worktrees/secondary", expectedHead: "a".repeat(40), expectedBranch: "refs/heads/topic" };
  });
  afterEach(() => database.close());

  it("should migrate idempotently without changing existing workspaces or conversations", async () => {
    const previous = await repository.list(input.projectId);
    const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'protect_move_%'")
      .all() as { name: string }[];
    for (const trigger of triggers) database.exec(`DROP TRIGGER "${trigger.name}"`);
    database.exec("DROP TABLE workspace_moves; DELETE FROM schema_migrations WHERE version = 45;");
    applySchemaMigrationV45(database);
    applySchemaMigrationV45(database);
    expect(await repository.list(input.projectId)).toEqual(previous);
    expect(await repository.moves.list(input.projectId)).toEqual([]);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should publish movement atomically while retaining immutable turn evidence and conversation identities", async () => {
    const reserved = await repository.reserve(input.workspaceId, "thread");
    await repository.submitting(reserved.id);
    await repository.acknowledge(reserved.id, "turn");
    await repository.observeTurn("source", "thread", "turn", true);
    const move = await repository.moves.begin(input);
    expect((await repository.get(input.workspaceId))?.movePending).toBe(true);
    await repository.moves.submitting(move.id);
    await repository.moves.commit(move.id);
    expect(await repository.getForThread("thread")).toMatchObject({ id: input.workspaceId, projectId: input.projectId,
      path: input.destinationPath, managed: true });
    expect(await repository.listTurnContexts("thread")).toMatchObject([{ workspaceId: input.workspaceId, cwd: "/secondary" }]);
    expect(await repository.getThreadRelocationPath("thread")).toBe("/secondary");
    expect(await repository.listPathAliases(input.workspaceId)).toEqual(["/secondary"]);
    expect(await repository.moves.list(input.projectId)).toEqual([]);
  });

  it("should reserve both paths and protect the target and primary against conflicting operations", async () => {
    const move = await repository.moves.begin(input);
    await expect(repository.reserve(input.workspaceId, "thread")).rejects.toThrow("pending move");
    await expect(repository.transitions.begin("thread", input.primaryWorkspaceId)).rejects.toThrow("pending move");
    await expect(repository.resolvePath(input.destinationPath, "source")).rejects.toThrow("pending move");
    await expect(repository.relocate(input.primaryWorkspaceId, "/another-primary")).rejects.toThrow("pending move");
    await expect(repository.relocate(input.workspaceId, "/another")).rejects.toThrow("pending move");
    await expect(repository.removals.begin(input.projectId, input.workspaceId, "source", input.primaryWorkspaceId, input.repositoryPath))
      .rejects.toThrow("pending move");
    await expect(repository.creations.begin({ primaryWorkspaceId: input.primaryWorkspaceId, sourceId: "source",
      projectPath: "/repo", repositoryPath: input.repositoryPath, destinationPath: "/new", start: { mode: "detached", startPoint: "HEAD" } }))
      .rejects.toThrow("pending move");
    await repository.moves.fail(move.id);
    expect((await repository.get(input.workspaceId))?.movePending).toBeUndefined();
  });

  it("should retain uncertain movement and require positive failure before cancellation", async () => {
    const move = await repository.moves.begin(input);
    await repository.moves.submitting(move.id);
    await repository.moves.fail(move.id);
    await expect(repository.moves.cancel(move.id)).rejects.toThrow("cannot be cancelled");
    expect(await repository.moves.get(move.id)).toMatchObject({ state: "uncertain", gitExitCode: null });
    expect((await repository.get(input.workspaceId))?.movePending).toBe(true);
  });

  it("should cancel positive failure without changing paths or adding aliases", async () => {
    const move = await repository.moves.begin(input);
    await repository.moves.submitting(move.id);
    await repository.moves.confirmGit(move.id, 1);
    await repository.moves.cancel(move.id);
    expect((await repository.get(input.workspaceId))?.path).toBe(input.workspacePath);
    expect(await repository.listPathAliases(input.workspaceId)).toEqual([]);
  });

  it("should reject primary, imported, wrong-source and reserved identities before dispatch", async () => {
    await expect(repository.moves.begin({ ...input, workspaceId: input.primaryWorkspaceId, workspacePath: input.projectPath })).rejects.toThrow("Move identity");
    await expect(repository.moves.begin({ ...input, sourceId: "other" })).rejects.toThrow("Move identity");
    database.prepare("UPDATE project_workspaces SET managed = 0 WHERE id = ?").run(input.workspaceId);
    await expect(repository.moves.begin(input)).rejects.toThrow("Move identity");
    database.prepare("UPDATE project_workspaces SET managed = 1 WHERE id = ?").run(input.workspaceId);
    await repository.reserve(input.workspaceId, "thread");
    await expect(repository.moves.begin(input)).rejects.toThrow("reserved");
  });

  it("should reserve Windows destination ownership regardless of case and separators", async () => {
    const move = await repository.moves.begin({ ...input, destinationPath: "C:\\Storage\\Target" });
    await expect(repository.resolvePath("c:/storage/target", "source")).rejects.toThrow("pending move");
    await repository.moves.fail(move.id);
    await repository.resolvePath("c:/storage/target", "source");
    await expect(repository.moves.begin({ ...input, destinationPath: "C:\\Storage\\Target" })).rejects.toThrow("occupied");
  });

  it("should roll back journal release when atomic relocation publication fails", async () => {
    const move = await repository.moves.begin(input);
    await repository.moves.submitting(move.id);
    database.exec(`CREATE TRIGGER fixture_publication_failure BEFORE UPDATE OF path ON project_workspaces
      BEGIN SELECT RAISE(ABORT, 'fixture disk failure'); END;`);
    await expect(repository.moves.commit(move.id)).rejects.toThrow("fixture disk failure");
    expect(await repository.moves.get(move.id)).not.toBeNull();
    expect(await repository.listPathAliases(input.workspaceId)).toEqual([]);
    expect((await repository.get(input.workspaceId))?.path).toBe(input.workspacePath);
  });
});
