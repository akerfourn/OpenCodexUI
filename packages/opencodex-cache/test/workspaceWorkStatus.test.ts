import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceWorkStatusInput } from "@open-codex-ui/opencodex-protocol";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import { clearSourceAssociations } from "../src/sqlite/sources/sourceQueries";

/** Copies a reviewed workspace into a plain optimistic metadata update. */
function request(workspace: OpenCodexProjectWorkspace, workStatus: "active" | "completed" = "completed"): OpenCodexWorkspaceWorkStatusInput {
  return { projectId: workspace.projectId, workspaceId: workspace.id, sourceId: workspace.sourceId,
    workspacePath: workspace.path, workStatus, expectedWorkStatus: workspace.workStatus ?? "active",
    expectedCompletedAt: workspace.completedAt ?? null };
}

describe("persistent workspace work progress", () => {
  let directory: string;
  let filename: string;
  let database: Database.Database;
  let repository: SqliteWorkspaceCacheRepository;
  let primary: OpenCodexProjectWorkspace;
  let secondary: OpenCodexProjectWorkspace;

  /** Reopens the same database file without invoking source-side effects. */
  function open(): void {
    database = new Database(filename);
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    repository = new SqliteWorkspaceCacheRepository(database);
  }
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-progress-"));
    filename = path.join(directory, "cache.sqlite");
    open();
    primary = await repository.resolvePath("/repo", "source");
    database.prepare(`INSERT INTO project_workspaces (id, project_id, source_id, source_key, path, managed)
      VALUES ('secondary', ?, 'source', 'source', '/secondary', 1)`).run(primary.projectId);
    secondary = (await repository.get("secondary"))!;
  });
  afterEach(() => {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it("should migrate version 45 workspaces as active without changing their identities or names", async () => {
    await repository.rename(primary.projectId, secondary.id, "Existing work");
    database.exec(`DROP TRIGGER primary_workspace_status_insert;
      DROP TRIGGER primary_workspace_status_update;
      ALTER TABLE project_workspaces DROP COLUMN completed_at;
      ALTER TABLE project_workspaces DROP COLUMN work_status;
      DELETE FROM schema_migrations WHERE version >= 46;`);
    runMigrations(database);
    runMigrations(database);
    expect(await repository.get(secondary.id)).toEqual({ ...secondary, name: "Existing work", workStatus: "active", completedAt: null });
    expect(await repository.get(primary.id)).toEqual(primary);
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 46").get()).toEqual({ count: 1 });
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should persist a completion date across reopening and preserve it on a repeated confirmation", async () => {
    const input = request(secondary);
    const completed = await repository.setWorkStatus(input);
    expect(completed).toMatchObject({ workStatus: "completed", completedAt: "2026-10-22T12:00:00.000Z" });
    database.close();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    open();
    expect(await repository.get(secondary.id)).toEqual(completed);
    expect(await repository.setWorkStatus(input)).toEqual(completed);
  });

  it("should migrate completed version 46 primaries without changing secondary progress or history", async () => {
    const completed = await repository.setWorkStatus(request(secondary));
    database.exec(`DROP TRIGGER primary_workspace_status_insert;
      DROP TRIGGER primary_workspace_status_update;
      DELETE FROM schema_migrations WHERE version = 47;`);
    database.prepare("UPDATE project_workspaces SET work_status = 'completed', completed_at = '2026-10-20' WHERE id = ?")
      .run(primary.id);
    database.prepare(`INSERT INTO threads (id, project_id, source_id, current_workspace_id, cwd, title, status)
      VALUES ('primary-thread', ?, 'source', ?, '/repo', 'Existing conversation', 'idle')`).run(primary.projectId, primary.id);
    const before = database.prepare("SELECT * FROM threads WHERE id = 'primary-thread'").get();
    runMigrations(database);
    runMigrations(database);
    expect(await repository.get(primary.id)).toEqual(primary);
    expect(await repository.get(secondary.id)).toEqual(completed);
    expect(database.prepare("SELECT * FROM threads WHERE id = 'primary-thread'").get()).toEqual(before);
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 47").get()).toEqual({ count: 1 });
    database.close();
    open();
    expect(await repository.get(primary.id)).toEqual(primary);
    expect(await repository.get(secondary.id)).toEqual(completed);
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it.each(["active", "completed"] as const)("should reject any primary status update, including %s", async status => {
    await expect(repository.setWorkStatus(request(primary, status)))
      .rejects.toThrow("The primary workspace has no editable work status.");
    expect(await repository.get(primary.id)).toEqual(primary);
  });

  it("should enforce permanent primaries for direct inserts, updates and role changes", async () => {
    const message = "Primary workspaces must remain active without a completion date.";
    expect(() => database.prepare("UPDATE project_workspaces SET work_status = 'completed', completed_at = '2026-10-22' WHERE id = ?")
      .run(primary.id)).toThrow(message);
    expect(() => database.prepare(`INSERT INTO project_workspaces
      (id, project_id, source_id, source_key, path, is_primary, work_status, completed_at)
      VALUES ('invalid-primary', ?, 'other', 'other', '/other', 1, 'completed', '2026-10-22')`)
      .run(primary.projectId)).toThrow(message);
    await repository.setWorkStatus(request(secondary));
    expect(() => database.prepare("UPDATE project_workspaces SET is_primary = 1 WHERE id = ?").run(secondary.id)).toThrow(message);
    expect(await repository.get(primary.id)).toEqual(primary);
  });

  it("should clear the completion date when reopened and start a new completed period later", async () => {
    const completed = await repository.setWorkStatus(request(secondary));
    const active = await repository.setWorkStatus(request(completed, "active"));
    expect(active).toMatchObject({ workStatus: "active", completedAt: null });
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    expect(await repository.setWorkStatus(request(active))).toMatchObject({
      workStatus: "completed", completedAt: "2026-10-24T12:00:00.000Z"
    });
  });

  it("should reject an obsolete completed period instead of silently reopening newer work", async () => {
    const completed = await repository.setWorkStatus(request(secondary));
    await expect(repository.setWorkStatus({ ...request(completed, "active"), expectedCompletedAt: "2000-01-01" }))
      .rejects.toThrow("work status changed");
    expect(await repository.get(secondary.id)).toEqual(completed);
  });

  it.each(["project", "source", "path", "removed"])("should reject a stale workspace identity: %s", async changed => {
    const input = request(secondary);
    if (changed === "project") input.projectId = "another-project";
    if (changed === "source") input.sourceId = "another-source";
    if (changed === "path") input.workspacePath = "/moved";
    if (changed === "removed") database.prepare("UPDATE project_workspaces SET removed_at = '2026-10-22' WHERE id = ?").run(secondary.id);
    await expect(repository.setWorkStatus(input)).rejects.toThrow("Workspace context changed");
    expect((await repository.get(secondary.id))?.workStatus).toBe("active");
  });

  it("should reject metadata updates while removal or movement has reserved the checkout", async () => {
    const removal = await repository.removals.begin(primary.projectId, secondary.id, "source", primary.id, "/repo/.git");
    await expect(repository.setWorkStatus(request(secondary))).rejects.toThrow("pending maintenance");
    await repository.removals.cancel(removal.id);
    database.prepare(`INSERT INTO workspace_moves (id, workspace_id, project_id, source_id, primary_workspace_id,
      project_path, workspace_path, destination_path, repository_path, git_directory, expected_head, state)
      VALUES ('move', ?, ?, 'source', ?, '/repo', '/secondary', '/destination', '/repo/.git', '/admin', 'head', 'preparing')`)
      .run(secondary.id, primary.projectId, primary.id);
    await expect(repository.setWorkStatus(request(secondary))).rejects.toThrow("pending maintenance");
  });

  it("should allow explicit local annotations after source removal without adopting another source", async () => {
    await clearSourceAssociations(database, "source");
    await expect(repository.setWorkStatus(request(secondary))).rejects.toThrow("context changed");
    const orphan = (await repository.get(secondary.id))!;
    expect(orphan.sourceId).toBeNull();
    expect(await repository.setWorkStatus(request(orphan))).toMatchObject({ sourceId: null, workStatus: "completed" });
  });

  it("should leave live reservations, conversations and imported ownership intact", async () => {
    database.prepare(`INSERT INTO threads (id, project_id, source_id, current_workspace_id, cwd, title, status)
      VALUES ('thread', ?, 'source', ?, '/secondary', 'Working', 'active')`).run(primary.projectId, secondary.id);
    const reservation = await repository.reserve(secondary.id, "thread");
    const completed = await repository.setWorkStatus(request(secondary));
    expect(await repository.listReservations(secondary.id)).toEqual([reservation]);
    expect(await repository.getForThread("thread")).toEqual(completed);
    const active = await repository.setWorkStatus(request(completed, "active"));
    expect(active.completedAt).toBeNull();
    database.prepare("UPDATE project_workspaces SET managed = 0 WHERE id = ?").run(secondary.id);
    expect(await repository.setWorkStatus(request(active))).toMatchObject({ managed: false, workStatus: "completed" });
    expect(await repository.get(primary.id)).toEqual(primary);
  });

  it("should reject unsupported statuses and inconsistent dates without mutating progress", async () => {
    const invalid = { ...request(secondary), workStatus: "archived" } as unknown as OpenCodexWorkspaceWorkStatusInput;
    await expect(repository.setWorkStatus(invalid)).rejects.toThrow("Unsupported workspace work status");
    expect(() => database.prepare("UPDATE project_workspaces SET work_status = 'completed' WHERE id = ?").run(secondary.id))
      .toThrow("CHECK constraint failed");
    expect(() => database.prepare("UPDATE project_workspaces SET completed_at = '2026-10-22' WHERE id = ?").run(secondary.id))
      .toThrow("CHECK constraint failed");
    expect(await repository.get(secondary.id)).toEqual(secondary);
  });
});
