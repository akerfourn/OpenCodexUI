import { listThreads } from "../src/sqlite/threads/threadIndexQueries";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";

/** Exercises registration against real SQLite identity and creation guards. */
describe("external workspace registration", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;
  let primary: OpenCodexProjectWorkspace;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
    primary = await workspaces.resolvePath("/repo", "source");
  });

  afterEach(() => database.close());

  /** Registers one batch with the identity captured before source inspection. */
  async function register(paths: string[]) {
    return await workspaces.registerDiscovered(primary.id, "source", primary.path, paths);
  }

  it("should list secondary conversations under their logical project without mixing sources", async () => {
    await register(["/external"]);
    const secondary = (await workspaces.list(primary.projectId)).find((item) => !item.isPrimary)!;
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('secondary-thread', ?, 'source', '/external', ?, 'keep')`).run(primary.projectId, secondary.id);
    const rows = await listThreads(database, { scope: "currentProject", currentProjectPath: "/repo", sourceId: "source" });
    expect(rows.map((item) => item.id)).toEqual(["secondary-thread"]);
    expect(await listThreads(database, { scope: "currentProject", currentProjectPath: "/repo", sourceId: "other" }))
      .toEqual([]);
  });

  it("should register unmanaged workspaces idempotently without duplicating projects", async () => {
    expect(await register(["/repo", "/external", "/external"])).toEqual([]);
    const first = await workspaces.list(primary.projectId);
    expect(first).toContainEqual(expect.objectContaining({ path: "/external", isPrimary: false, managed: false }));
    await register(["/external"]);
    expect(await workspaces.list(primary.projectId)).toEqual(first);
    expect(database.prepare("SELECT id FROM projects").all()).toHaveLength(1);
    expect((await workspaces.resolvePath("/external", "source")).projectId).toBe(primary.projectId);
  });

  it("should preserve existing managed ownership and primary identity", async () => {
    const creation = await workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: "/repo", repositoryPath: "/repo/.git", destinationPath: "/managed",
      start: { mode: "detached", startPoint: "HEAD" } });
    await workspaces.creations.submitting(creation.id, "a".repeat(40), null);
    await workspaces.creations.confirmGit(creation.id);
    await workspaces.creations.commit(creation.id);
    const before = await workspaces.list(primary.projectId);

    await register(["/repo", "/managed"]);

    expect(await workspaces.list(primary.projectId)).toEqual(before);
    expect(await workspaces.get(creation.workspaceId)).toMatchObject({ managed: true });
  });

  it("should report another project instead of reassigning its workspace or threads", async () => {
    const other = await workspaces.resolvePath("/other", "source");
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/other', ?, 'keep')`).run(other.projectId, other.id);

    expect(await register(["/other", "/external"])).toEqual([{ path: "/other", reason: "anotherProject" }]);
    expect(await workspaces.getForThread("thread")).toMatchObject({ id: other.id, projectId: other.projectId });
    expect(await workspaces.list(primary.projectId)).toHaveLength(2);
  });

  it("should not adopt a pending creation even if Git already lists its destination", async () => {
    await workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source", projectPath: "/repo",
      repositoryPath: "/repo/.git", destinationPath: "/pending", start: { mode: "detached", startPoint: "HEAD" } });
    expect(await register(["/pending", "/external"])).toEqual([{ path: "/pending", reason: "creationPending" }]);
    expect(await workspaces.list(primary.projectId)).toHaveLength(2);
    expect(await workspaces.creations.list(primary.projectId)).toHaveLength(1);
  });

  it("should preserve removed workspaces and ignore ownership in a different source", async () => {
    await register(["/removed"]);
    database.prepare("UPDATE project_workspaces SET removed_at = 'removed' WHERE path = '/removed'").run();
    await workspaces.resolvePath("/external", "other-source");
    expect(await register(["/removed", "/external"])).toEqual([{ path: "/removed", reason: "removed" }]);
    expect(await workspaces.list(primary.projectId)).toContainEqual(expect.objectContaining({
      path: "/external", sourceId: "source", managed: false
    }));
  });

  it("should reject stale primary identity before inserting anything", async () => {
    await workspaces.relocate(primary.id, "/moved");
    await expect(register(["/external"])).rejects.toThrow("Primary workspace changed");
    expect(await workspaces.list(primary.projectId)).toHaveLength(1);
  });

  it("should roll back an entire discovery batch when an insert fails", async () => {
    database.exec(`CREATE TRIGGER simulated_failure BEFORE INSERT ON project_workspaces
      WHEN NEW.path = '/failure' BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;`);
    await expect(register(["/external", "/failure"])).rejects.toThrow("simulated write failure");
    expect(await workspaces.list(primary.projectId)).toHaveLength(1);
  });
});
