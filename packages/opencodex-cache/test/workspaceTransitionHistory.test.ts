import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV53 } from "../src/sqlite/migrations/v53";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

let database: Database.Database;
let workspaces: SqliteWorkspaceCacheRepository;
let primaryId: string;
let directory: string;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-transition-history-"));
  database = new Database(path.join(directory, "cache.sqlite"));
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  workspaces = new SqliteWorkspaceCacheRepository(database);
  const primary = await workspaces.resolvePath("/project", "source");
  primaryId = primary.id;
  database.prepare(`INSERT INTO project_workspaces (id, project_id, source_id, source_key, path, name)
    VALUES ('secondary', ?, 'source', 'source', '/feature', 'Feature')`).run(primary.projectId);
  database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title, newest_turn_id)
    VALUES ('thread', ?, 'source', '/project', ?, 'Thread', 'previous-turn')`).run(primary.projectId, primaryId);
});
afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
  vi.useRealTimers();
});

/** Confirms only the transition whose resume reply has already been verified by the service. */
async function select(workspaceId: string): Promise<string> {
  const transition = await workspaces.transitions.begin("thread", workspaceId);
  await workspaces.transitions.submitting(transition.id, "{}");
  await workspaces.transitions.commit(transition.id);
  return transition.id;
}

describe("confirmed workspace transition history", () => {
  it("should preserve existing data and avoid guessing past changes when replaying migration", async () => {
    expect(await workspaces.transitions.history("thread")).toEqual([]);
    const id = await select("secondary");
    database.prepare("DELETE FROM schema_migrations WHERE version = 53").run();
    applySchemaMigrationV53(database);
    applySchemaMigrationV53(database);
    expect(await workspaces.transitions.history("thread")).toHaveLength(1);
    expect((await workspaces.transitions.history("thread"))[0]?.id).toBe(id);
  });

  it("should freeze names, paths, dates and the last turn without losing an immediate return", async () => {
    const first = await select("secondary");
    await select(primaryId);
    database.prepare("UPDATE project_workspaces SET name = 'Renamed', path = '/moved' WHERE id = 'secondary'").run();
    database.close();
    database = new Database(path.join(directory, "cache.sqlite"));
    database.pragma("foreign_keys = ON");
    workspaces = new SqliteWorkspaceCacheRepository(database);
    const events = await workspaces.transitions.history("thread");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      id: first, threadId: "thread", sourceId: "source", afterTurnId: "previous-turn", occurredAt: "2026-11-05T10:00:00.000Z",
      from: { workspaceId: primaryId, isPrimary: true, path: "/project" },
      to: { workspaceId: "secondary", name: "Feature", isPrimary: false, path: "/feature" }
    });
    expect(events[1]?.from.path).toBe("/feature");
    expect(events[1]?.to.workspaceId).toBe(primaryId);
    expect(await workspaces.transitions.history("another-thread")).toEqual([]);
  });

  it("should record nothing for a failed or uncertain transition before verified recovery", async () => {
    const transition = await workspaces.transitions.begin("thread", "secondary");
    await workspaces.transitions.submitting(transition.id, "{}");
    await workspaces.transitions.fail(transition.id);
    expect(await workspaces.transitions.history("thread")).toEqual([]);
    await workspaces.transitions.submitting(transition.id, "{}");
    await workspaces.transitions.commit(transition.id);
    await expect(workspaces.transitions.commit(transition.id)).rejects.toThrow("does not exist");
    expect(await workspaces.transitions.history("thread")).toHaveLength(1);
  });

  it("should roll back selection and reservation release when writing history fails", async () => {
    const transition = await workspaces.transitions.begin("thread", "secondary");
    await workspaces.transitions.submitting(transition.id, "{}");
    database.exec(`CREATE TRIGGER fail_history BEFORE INSERT ON workspace_transition_history
      BEGIN SELECT RAISE(ABORT, 'history unavailable'); END;`);
    await expect(workspaces.transitions.commit(transition.id)).rejects.toThrow("history unavailable");
    expect((await workspaces.getForThread("thread"))?.id).toBe(primaryId);
    expect((await workspaces.transitions.getForThread("thread"))?.id).toBe(transition.id);
    expect(await workspaces.transitions.history("thread")).toEqual([]);
  });

  it("should remove events only with their conversation and never record an unchanged association", async () => {
    await select(primaryId);
    expect(await workspaces.transitions.history("thread")).toEqual([]);
    await select("secondary");
    database.prepare("DELETE FROM threads WHERE id = 'thread'").run();
    expect(await workspaces.transitions.history("thread")).toEqual([]);
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
