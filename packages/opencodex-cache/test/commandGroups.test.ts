import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV52 } from "../src/sqlite/migrations/v52";
import { SqliteCommandGroupsRepository } from "../src/sqlite/automation/SqliteCommandGroupsRepository";
import { createProjectCommand, listProjectCommands } from "../src/sqlite/automation/projectCommandQueries";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

let database: Database.Database;
let groups: SqliteCommandGroupsRepository;
let projectId: string;
let otherId: string;

beforeEach(async () => {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  groups = new SqliteCommandGroupsRepository(database);
  const workspaces = new SqliteWorkspaceCacheRepository(database);
  projectId = (await workspaces.resolvePath("/project", "source")).projectId;
  otherId = (await workspaces.resolvePath("/other", "other-source")).projectId;
});
afterEach(() => database.close());

/** Creates a real command using the legacy-compatible command API. */
async function command(project = projectId, groupName: string | null = "Build", isFavorite = false) {
  return await createProjectCommand(database, { projectId: project, name: "Build", command: "just build",
    executionMode: "workspace", persistLogs: true, groupName, isFavorite });
}

describe("persistent project command groups", () => {
  it("should migrate memberships idempotently and preserve later empty groups", async () => {
    const first = await command(projectId, "Build", true);
    await command(projectId, "Tools");
    database.exec(`DROP TRIGGER register_command_group_insert; DROP TRIGGER register_command_group_update;
      DROP TABLE project_command_groups; DELETE FROM schema_migrations WHERE version = 52;`);
    const before = await listProjectCommands(database, projectId);
    applySchemaMigrationV52(database);
    applySchemaMigrationV52(database);
    expect(await groups.list(projectId)).toEqual(["Build", "Tools"]);
    expect(await listProjectCommands(database, projectId)).toEqual(before);
    await groups.create(projectId, "Empty");
    database.exec("DELETE FROM schema_migrations WHERE version = 52");
    applySchemaMigrationV52(database);
    expect(await groups.list(projectId)).toEqual(["Build", "Tools", "Empty"]);
    expect((await listProjectCommands(database, projectId))[0]).toEqual(first);
  });

  it("should retain empty groups after repository reconstruction and scope names by project", async () => {
    await groups.create(projectId, "Build");
    await groups.create(otherId, "Build");
    groups = new SqliteCommandGroupsRepository(database);
    expect(await groups.list(projectId)).toEqual(["Build"]);
    expect(await listProjectCommands(database, projectId)).toEqual([]);
    await groups.rename(projectId, "Build", "Release");
    expect(await groups.list(otherId)).toEqual(["Build"]);
  });

  it("should rename all memberships atomically and keep favorite/executable metadata intact", async () => {
    const favorite = await command(projectId, "Build", true);
    const ordinary = await command();
    const foreign = await command(otherId);
    await groups.rename(projectId, "Build", "Release");
    expect(await listProjectCommands(database, projectId)).toMatchObject([
      { ...favorite, groupName: "Release", updatedAt: expect.any(String) },
      { ...ordinary, groupName: "Release", updatedAt: expect.any(String) }
    ]);
    expect(await listProjectCommands(database, otherId)).toEqual([foreign]);
  });

  it("should ungroup commands on group deletion without deleting commands or their favorite status", async () => {
    const favorite = await command(projectId, "Build", true);
    await groups.delete(projectId, "Build");
    expect(await groups.list(projectId)).toEqual([]);
    expect(await listProjectCommands(database, projectId)).toMatchObject([{ ...favorite, groupName: null, updatedAt: expect.any(String) }]);
  });

  it("should assign only to an existing group in the command's project and preserve minimal metadata", async () => {
    const current = await command(projectId, null, true);
    await groups.create(projectId, "Build");
    expect(await groups.assign(projectId, current.id, "Build")).toMatchObject({ ...current, groupName: "Build", updatedAt: expect.any(String) });
    await expect(groups.assign(otherId, current.id, null)).rejects.toThrow("does not belong");
    await groups.delete(projectId, "Build");
    await expect(groups.assign(projectId, current.id, "Build")).rejects.toThrow("no longer exists");
    expect(await groups.list(projectId)).toEqual([]);
  });

  it("should roll back a failed membership rename and reject duplicate or invalid names", async () => {
    await command();
    await groups.create(projectId, "Tools");
    await expect(groups.rename(projectId, "Build", "Tools")).rejects.toThrow("already exists");
    await expect(groups.create(projectId, "   ")).rejects.toThrow("1 to 100");
    await expect(groups.create(projectId, "x".repeat(101))).rejects.toThrow("1 to 100");
    database.exec(`CREATE TRIGGER fixture_fail_group_rename BEFORE UPDATE OF group_name ON project_commands
      BEGIN SELECT RAISE(ABORT, 'fixture update failed'); END;`);
    await expect(groups.rename(projectId, "Build", "Release")).rejects.toThrow("fixture update failed");
    expect(await groups.list(projectId)).toEqual(["Build", "Tools"]);
    expect((await listProjectCommands(database, projectId))[0]?.groupName).toBe("Build");
  });
});
