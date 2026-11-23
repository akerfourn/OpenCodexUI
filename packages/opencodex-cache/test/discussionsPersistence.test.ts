import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV56 } from "../src/sqlite/migrations/v56";
import { SqliteProjectCacheRepository } from "../src/sqlite/projects/SqliteProjectCacheRepository";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import { writeThreadIndex } from "../src/sqlite/threads/threadIndexWriter";
import { deleteEmptyUnsyncedThreads, listThreads } from "../src/sqlite/threads/threadIndexQueries";
import { getSourceProjectCount } from "../src/sqlite/sources/sourceQueries";
import type { CachedThreadSummary } from "../src/types";

const databases: Database.Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

describe("personal conversation persistence", () => {
  it("should preserve old projects and apply the classification migration idempotently", () => {
    const database = new Database(":memory:");
    databases.push(database);
    database.exec(`CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT);
      CREATE TABLE projects(id TEXT PRIMARY KEY, path TEXT, display_name TEXT);
      INSERT INTO projects VALUES ('existing', '/my/project', 'My project');`);

    applySchemaMigrationV56(database);
    applySchemaMigrationV56(database);
    database.prepare("DELETE FROM schema_migrations WHERE version = 56").run();
    applySchemaMigrationV56(database);

    expect(database.prepare("SELECT * FROM projects").get()).toEqual({
      id: "existing", path: "/my/project", display_name: "My project", kind: "project", discussion_key: null,
      discussion_creation_cancelled: 0, discussion_thread_id: null
    });
    expect(database.prepare("SELECT version FROM schema_migrations").all()).toEqual([{ version: 56 }]);
  });

  it("should retain personal ownership through native indexing without creating Home projects", async () => {
    const { database, projects, workspaces } = createRepositories();
    const ordinary = await projects.upsertProject("/repo", "source");
    const personal = await projects.createDiscussionEnvironment("/codex/discussions/one", "source", "draft-one");
    writeThreadIndex(database, [thread("personal", personal.path, "source")]);
    // Native synchronization supplies cwd and source, but knows nothing about our classification.
    writeThreadIndex(database, [thread("personal", personal.path, "source")]);
    await projects.upsertProject(personal.path, "source");

    expect((await projects.listProjects()).map((project) => project.id)).toEqual([ordinary.id]);
    expect(await getSourceProjectCount(database, "source")).toBe(1);
    expect((await projects.listProjectGroups()).items).toEqual([
      expect.objectContaining({ type: "project", projectId: ordinary.id })
    ]);
    expect(await listThreads(database, { scope: "all", currentProjectPath: null })).toEqual([
      expect.objectContaining({ id: "personal", discussionEnvironmentId: personal.id, sourceId: "source" })
    ]);
    expect(await workspaces.getForThread("personal")).toMatchObject({ projectId: personal.id, path: personal.path });
    runMigrations(database);
    expect((await projects.listDiscussionEnvironments())[0]).toMatchObject({ id: personal.id, kind: "discussion" });
  });

  it("should reuse a draft context and reject source, path and ownership changes", async () => {
    const { projects } = createRepositories();
    const first = await projects.createDiscussionEnvironment("/discussions/one", "source-a", "key");
    const repeated = await projects.createDiscussionEnvironment("/discussions/one", "source-a", "key");
    const otherSource = await projects.createDiscussionEnvironment("/discussions/one", "source-b", "other-key");

    expect(repeated.id).toBe(first.id);
    expect(otherSource.id).not.toBe(first.id);
    await expect(projects.createDiscussionEnvironment("/discussions/one", "source-b", "key"))
      .rejects.toThrow("another source or working directory");
    await expect(projects.createDiscussionEnvironment("/elsewhere", "source-a", "key"))
      .rejects.toThrow("another source or working directory");
    await expect(projects.createDiscussionEnvironment("/discussions/one", "source-a", "replacement"))
      .rejects.toThrow("another draft");
    await projects.upsertProject("/existing-project", "source-a");
    await expect(projects.createDiscussionEnvironment("/existing-project", "source-a", "conversion"))
      .rejects.toThrow("A project already owns");
  });

  it("should keep unsent native identities through cache cleanup and enforce durable execution gates", async () => {
    const { database, projects, workspaces } = createRepositories();
    const personal = await projects.createDiscussionEnvironment("/discussions/one", "source", "key");
    writeThreadIndex(database, [{ ...thread("personal", personal.path, "source"), codexTitle: "", title: "" }]);

    expect(await deleteEmptyUnsyncedThreads(database, personal.path, "source")).toBe(0);
    const workspace = await workspaces.getForThread("personal");
    const reservation = await workspaces.reserve(workspace!.id, "personal");
    await workspaces.submitting(reservation.id);
    await workspaces.fail(reservation.id);

    await expect(workspaces.reserve(workspace!.id, "personal")).rejects.toThrow("unresolved workspace execution");
    expect(await workspaces.getReservationForThread("personal")).toMatchObject({ sourceId: "source", state: "uncertain" });
  });

  it("should abandon only unbound identity allocation and retain a cancellation tombstone", async () => {
    const { projects, workspaces } = createRepositories();
    const environment = await projects.createDiscussionEnvironment("/pending", "source", "key");
    const workspace = (await workspaces.list(environment.id))[0];
    const reservation = await workspaces.reserve(workspace.id, null);
    await workspaces.submittingCreation(reservation.id);
    await workspaces.fail(reservation.id);

    await expect(projects.cancelDiscussionCreation(environment.id, "other-source")).rejects.toThrow("requested source");
    await projects.cancelDiscussionCreation(environment.id, "source");

    expect(await workspaces.listReservations(workspace.id)).toEqual([]);
    expect((await projects.listDiscussionEnvironments())[0]).toMatchObject({
      id: environment.id, path: "/pending", discussionCreationCancelled: true
    });
    await expect(projects.createDiscussionEnvironment("/pending", "source", "key")).rejects.toThrow("cancelled");
  });

  it("should retain confirmed identity after native deletion instead of resurrecting setup", async () => {
    const { database, projects } = createRepositories();
    const environment = await projects.createDiscussionEnvironment("/confirmed", "source", "key");
    writeThreadIndex(database, [thread("confirmed", environment.path, "source")]);
    await projects.completeDiscussionCreation(environment.id, "source", "confirmed");
    database.prepare("DELETE FROM threads WHERE id = 'confirmed'").run();

    expect((await projects.listDiscussionEnvironments())[0]).toMatchObject({ discussionThreadId: "confirmed" });
    await expect(projects.cancelDiscussionCreation(environment.id, "source")).rejects.toThrow("native identity");
  });

  it("should preserve a native identity discovered after a lost reply when abandoning its unbound setup", async () => {
    const { database, projects, workspaces } = createRepositories();
    const environment = await projects.createDiscussionEnvironment("/pending", "source", "key");
    const workspace = (await workspaces.list(environment.id))[0];
    const reservation = await workspaces.reserve(workspace.id, null);
    await workspaces.submittingCreation(reservation.id);
    await workspaces.fail(reservation.id);
    writeThreadIndex(database, [thread("discovered", environment.path, "source")]);

    await projects.cancelDiscussionCreation(environment.id, "source");

    expect(await workspaces.listReservations(workspace.id)).toEqual([]);
    expect(await workspaces.getForThread("discovered")).toMatchObject({ id: workspace.id });
    expect(await listThreads(database, { scope: "all", currentProjectPath: null })).toMatchObject([{ id: "discovered" }]);
  });
});

/** Uses the real schema and ownership repositories with isolated in-memory storage. */
function createRepositories() {
  const database = new Database(":memory:");
  databases.push(database);
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  return {
    database, projects: new SqliteProjectCacheRepository(database), workspaces: new SqliteWorkspaceCacheRepository(database)
  };
}

/** Native summaries intentionally omit OpenCodexUI's discussion classification. */
function thread(id: string, cwd: string, sourceId: string): CachedThreadSummary {
  return {
    id, sourceId, sessionId: null, parentThreadId: null, codexTitle: "Chat", customTitle: null,
    title: "Chat", preview: "", model: null, reasoningEffort: null, projectName: null, projectPath: cwd,
    branchName: null, updatedAt: "2026-11-23T10:00:00.000Z", isArchived: false, threadSource: "appServer",
    agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true
  };
}
