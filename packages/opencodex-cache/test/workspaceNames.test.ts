import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

describe("workspace display metadata", () => {
  let database: Database.Database;
  let repository: SqliteWorkspaceCacheRepository;
  let projectId: string;
  let primaryId: string;
  let secondaryId: string;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    repository = new SqliteWorkspaceCacheRepository(database);
    const primary = await repository.resolvePath("/repo", "source");
    projectId = primary.projectId;
    primaryId = primary.id;
    await repository.registerDiscovered(primary.id, "source", "/repo", ["/feature"]);
    secondaryId = (await repository.list(projectId)).find((item) => !item.isPrimary)!.id;
  });
  afterEach(() => database.close());

  it("should migrate existing names without changing identities, associations or pending creation", async () => {
    database.prepare("UPDATE project_workspaces SET path = ? WHERE id = ?").run("C:\\repo\\feature", secondaryId);
    const creation = await repository.creations.begin({ primaryWorkspaceId: primaryId,
      sourceId: "source", projectPath: "/repo", repositoryPath: "/repo/.git", destinationPath: "/pending",
      start: { mode: "detached", startPoint: "HEAD" } });
    database.exec(`ALTER TABLE project_workspaces DROP COLUMN name;
      ALTER TABLE workspace_creations DROP COLUMN name;
      DELETE FROM schema_migrations WHERE version = 36;`);
    runMigrations(database);
    runMigrations(database);
    expect(await repository.get(secondaryId)).toMatchObject({ name: "feature", projectId, path: "C:\\repo\\feature" });
    expect(await repository.get(primaryId)).toMatchObject({ name: null, isPrimary: true });
    expect(await repository.creations.get(creation.id)).toMatchObject({ id: creation.id, destinationPath: "/pending" });
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should migrate interrupted custom creations without changing their destination or identity", async () => {
    const creation = await repository.creations.begin({ primaryWorkspaceId: primaryId,
      sourceId: "source", projectPath: "/repo", repositoryPath: "/repo/.git", destinationPath: "/custom",
      name: "Keep name", start: { mode: "detached", startPoint: "HEAD" } });
    await repository.creations.submitting(creation.id, "a".repeat(40), null);
    database.exec("ALTER TABLE workspace_creations DROP COLUMN root_path; DELETE FROM schema_migrations WHERE version = 37;");
    runMigrations(database);
    runMigrations(database);
    expect(await repository.creations.get(creation.id)).toMatchObject({ id: creation.id,
      workspaceId: creation.workspaceId, destinationPath: "/custom", name: "Keep name", rootPath: null, state: "submitting" });
  });

  it("should rename only metadata and retain it after rediscovery and cache reconstruction", async () => {
    const previous = await repository.get(secondaryId);
    await repository.rename(projectId, secondaryId, "  Mon expérimentation  ");
    await repository.registerDiscovered(primaryId, "source", "/repo", ["/feature"]);
    const reopened = new SqliteWorkspaceCacheRepository(database);
    expect(await reopened.get(secondaryId)).toEqual({ ...previous, name: "Mon expérimentation" });
  });

  it("should reject primary, foreign-project and invalid names", async () => {
    await expect(repository.rename(projectId, primaryId, "Other")).rejects.toThrow("secondary workspace");
    await expect(repository.rename("other-project", secondaryId, "Other")).rejects.toThrow("secondary workspace");
    await expect(repository.rename(projectId, secondaryId, " ")).rejects.toThrow("1 to 100");
    await expect(repository.rename(projectId, secondaryId, "a".repeat(101))).rejects.toThrow("1 to 100");
    await expect(repository.rename(projectId, secondaryId, "line\nbreak")).rejects.toThrow("control characters");
    expect(await repository.get(secondaryId)).toMatchObject({ name: "feature" });
  });

  it("should retain the requested name through uncertain creation and verified publication", async () => {
    const creation = await repository.creations.begin({ primaryWorkspaceId: primaryId,
      sourceId: "source", projectPath: "/repo", repositoryPath: "/repo/.git", destinationPath: "/new",
      name: "Nouvelle interface", start: { mode: "detached", startPoint: "HEAD" } });
    await repository.creations.submitting(creation.id, "a".repeat(40), null);
    await repository.creations.confirmGit(creation.id);
    await repository.creations.fail(creation.id);
    const reopened = new SqliteWorkspaceCacheRepository(database);
    expect(await reopened.creations.get(creation.id)).toMatchObject({ name: "Nouvelle interface", state: "uncertain" });
    const id = await reopened.creations.commit(creation.id);
    expect(await reopened.get(id)).toMatchObject({ name: "Nouvelle interface", path: "/new" });
  });
});
