import { clearSourceAssociations } from "../src/sqlite/sources/sourceQueries";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV35 } from "../src/sqlite/migrations/v35";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import type { WorkspaceCreationInput } from "../src/types/workspaceCreations";

const head = "a".repeat(40);

describe("workspace creation journal", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;
  let input: WorkspaceCreationInput;
  let projectId: string;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
    const primary = await workspaces.resolvePath("/repo", "source");
    projectId = primary.projectId;
    input = { primaryWorkspaceId: primary.id, sourceId: "source", projectPath: "/repo",
      repositoryPath: "/repo/.git", destinationPath: "/secondary",
      start: { mode: "newBranch", branchName: "topic", startPoint: "HEAD" } };
  });

  afterEach(() => database.close());

  it("should preserve existing primary data and be idempotent", async () => {
    const previous = await workspaces.list(projectId);
    database.exec(`DROP TRIGGER protect_creation_destination; DROP TRIGGER protect_creation_workspace;
      DROP TABLE workspace_creations; DELETE FROM schema_migrations WHERE version = 35;`);
    applySchemaMigrationV35(database);
    applySchemaMigrationV35(database);
    expect(await workspaces.list(projectId)).toEqual(previous);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should publish the same reserved identity only after Git confirmation", async () => {
    const creation = await workspaces.creations.begin(input);
    expect(await workspaces.list(projectId)).toHaveLength(1);
    await expect(workspaces.creations.commit(creation.id)).rejects.toThrow("not been confirmed");
    await workspaces.creations.submitting(creation.id, head, "refs/heads/topic");
    await workspaces.creations.confirmGit(creation.id);
    await workspaces.creations.fail(creation.id);

    expect(await workspaces.creations.commit(creation.id)).toBe(creation.workspaceId);
    expect(await workspaces.list(projectId)).toContainEqual(expect.objectContaining({
      id: creation.workspaceId, projectId, sourceId: "source", managed: true, isPrimary: false, path: "/secondary"
    }));
    expect(await workspaces.creations.list(projectId)).toEqual([]);
    expect((await workspaces.resolvePath("/secondary", "source")).projectId).toBe(projectId);
  });

  it("should exclude concurrent creations from another project sharing the same repository", async () => {
    await workspaces.creations.begin(input);
    const other = await workspaces.resolvePath("/other-checkout", "source");
    await expect(workspaces.creations.begin({ ...input, primaryWorkspaceId: other.id,
      projectPath: other.path, destinationPath: "/third" })).rejects.toThrow("UNIQUE constraint failed");
  });

  it("should keep identical repository paths independent across sources", async () => {
    await workspaces.creations.begin(input);
    const other = await workspaces.resolvePath("/repo", "other-source");
    await expect(workspaces.creations.begin({ ...input, primaryWorkspaceId: other.id,
      sourceId: "other-source" })).resolves.toMatchObject({ sourceId: "other-source" });
  });

  it("should prevent premature adoption, relocation and project deletion", async () => {
    await workspaces.creations.begin(input);
    await expect(workspaces.resolvePath("/secondary", "source")).rejects.toThrow("pending creation");
    await expect(workspaces.relocate(input.primaryWorkspaceId, "/moved")).rejects.toThrow("pending creation");
    expect(() => database.prepare("DELETE FROM projects WHERE id = ?").run(projectId))
      .toThrow("FOREIGN KEY constraint failed");
    expect(database.prepare("SELECT id FROM projects").all()).toHaveLength(1);
    await expect(clearSourceAssociations(database, "source")).rejects.toThrow("unresolved workspace executions");
  });

  it("should cancel only preparation and retain dispatched failures", async () => {
    const preparing = await workspaces.creations.begin(input);
    await workspaces.creations.fail(preparing.id);
    expect(await workspaces.creations.get(preparing.id)).toBeNull();
    const dispatched = await workspaces.creations.begin(input);
    await workspaces.creations.submitting(dispatched.id, head, null);
    await workspaces.creations.fail(dispatched.id);
    expect(await workspaces.creations.get(dispatched.id)).toMatchObject({ state: "uncertain", gitConfirmed: false });
    await expect(workspaces.creations.begin(input)).rejects.toThrow("UNIQUE constraint failed");
  });

  it("should restore the journal if workspace publication fails", async () => {
    const creation = await workspaces.creations.begin(input);
    await workspaces.creations.submitting(creation.id, head, null);
    await workspaces.creations.confirmGit(creation.id);
    database.exec(`CREATE TRIGGER simulate_disk_failure BEFORE INSERT ON project_workspaces
      BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;`);
    await expect(workspaces.creations.commit(creation.id)).rejects.toThrow("simulated write failure");
    expect(await workspaces.creations.get(creation.id)).toMatchObject({ gitConfirmed: true });
    expect(await workspaces.list(projectId)).toHaveLength(1);
  });
});
