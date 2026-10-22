import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import { writeThreadIndex } from "../src/sqlite/threads/threadIndexWriter";
import type { CachedThreadSummary } from "../src/types";

/** Source-aware fixture uses real indexing rather than a prefiltered visible chat list. */
function thread(id: string, path: string, overrides: Partial<CachedThreadSummary> = {}): CachedThreadSummary {
  return { id, sessionId: null, parentThreadId: null, sourceId: "source", projectPath: path, projectName: "Repo",
    codexTitle: id, customTitle: null, title: id, preview: "", model: null, reasoningEffort: null, branchName: null,
    updatedAt: "2026-01-01T00:00:00.000Z", isArchived: false, threadSource: null,
    agentNickname: null, agentRole: null, subAgentSource: null, canAcceptDirectInput: true, status: "idle", ...overrides };
}

describe("workspace activity cache projection", () => {
  let database: Database.Database;
  let repository: SqliteWorkspaceCacheRepository;
  beforeEach(() => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    repository = new SqliteWorkspaceCacheRepository(database);
  });
  afterEach(() => database.close());

  /** Adds a managed sibling without invoking source-side filesystem or Git effects. */
  function secondary(projectId: string): void {
    database.prepare(`INSERT INTO project_workspaces (id, project_id, source_id, source_key, path, managed)
      VALUES ('secondary', ?, 'source', 'source', '/secondary', 1)`).run(projectId);
  }

  /** Writes timestamped turn evidence using the same durable tables read after a snapshot refresh. */
  function turn(workspaceId: string, projectId: string, id: string, date: string): void {
    database.prepare(`INSERT INTO turns (thread_id, id, started_at, completed_at, raw_json, updated_at)
      VALUES ('parent', ?, ?, ?, '{}', '2099-01-01')`).run(id, date, date);
    database.prepare(`INSERT INTO turn_workspace_contexts
      (source_id, thread_id, turn_id, project_id, workspace_id, cwd) VALUES ('source', 'parent', ?, ?, ?, '/historical')`)
      .run(id, projectId, workspaceId);
  }

  it("should include archived conversations and active descendants without filtering to visible chats", async () => {
    writeThreadIndex(database, [thread("parent", "/repo", { isArchived: true }),
      thread("child", "/repo", { parentThreadId: "parent", status: "active", updatedAt: "2026-02-03T12:00:00Z" })]);
    const workspace = (await repository.getForThread("parent"))!;
    expect(await repository.activity(workspace.projectId)).toEqual([{
      workspaceId: workspace.id, sourceId: "source", workspacePath: "/repo",
      lastActivityAt: "2026-02-03T12:00:00.000Z", conversationCount: 2, activeConversationCount: 1, pendingOperationCount: 0
    }]);
  });

  it("should retain activity in an old workspace without attributing the thread's later work there", async () => {
    writeThreadIndex(database, [thread("parent", "/repo")]);
    const primary = (await repository.getForThread("parent"))!;
    secondary(primary.projectId);
    turn(primary.id, primary.projectId, "old-turn", "2026-01-02T00:00:00Z");
    await repository.select("parent", "secondary");
    writeThreadIndex(database, [thread("parent", "/secondary", { updatedAt: "2026-09-01T00:00:00Z" })]);
    turn("secondary", primary.projectId, "new-turn", "2026-08-01T00:00:00Z");
    const result = await repository.activity(primary.projectId);
    expect(result.find(item => item.workspaceId === primary.id)).toMatchObject({
      conversationCount: 0, lastActivityAt: "2026-01-02T00:00:00.000Z"
    });
    expect(result.find(item => item.workspaceId === "secondary")).toMatchObject({
      conversationCount: 1, lastActivityAt: "2026-09-01T00:00:00.000Z"
    });
  });

  it("should exclude another source even when its paths and timestamps match", async () => {
    writeThreadIndex(database, [thread("parent", "/repo"), thread("other", "/repo", {
      sourceId: "other-source", status: "active", updatedAt: "2099-01-01"
    })]);
    const workspace = (await repository.getForThread("parent"))!;
    expect(await repository.activity(workspace.projectId)).toMatchObject([{
      conversationCount: 1, activeConversationCount: 0, lastActivityAt: "2026-01-01T00:00:00.000Z"
    }]);
  });

  it("should keep empty or invalid dates unknown instead of using synchronization timestamps", async () => {
    writeThreadIndex(database, [thread("parent", "/repo", { updatedAt: "invalid-date" })]);
    const workspace = (await repository.getForThread("parent"))!;
    secondary(workspace.projectId);
    const result = await repository.activity(workspace.projectId);
    expect(result).toHaveLength(2);
    expect(result.every(item => item.lastActivityAt === null)).toBe(true);
  });

  it("should expose unresolved operations without writing to the database during inspection", async () => {
    writeThreadIndex(database, [thread("parent", "/repo")]);
    const workspace = (await repository.getForThread("parent"))!;
    const reservation = await repository.reserve(workspace.id, "parent");
    await repository.submitting(reservation.id);
    await repository.fail(reservation.id);
    const before = database.prepare("SELECT total_changes() AS count").get();
    expect(await repository.activity(workspace.projectId)).toMatchObject([{ pendingOperationCount: 1 }]);
    expect(database.prepare("SELECT total_changes() AS count").get()).toEqual(before);
  });

  it("should retain historical activity for a removed checkout while preserving its conversations", async () => {
    writeThreadIndex(database, [thread("parent", "/repo")]);
    const primary = (await repository.getForThread("parent"))!;
    secondary(primary.projectId);
    turn("secondary", primary.projectId, "historical", "2026-04-01T00:00:00Z");
    database.prepare("UPDATE project_workspaces SET removed_at = '2026-05-01' WHERE id = 'secondary'").run();
    expect((await repository.activity(primary.projectId)).find(item => item.workspaceId === "secondary"))
      .toMatchObject({ conversationCount: 0, lastActivityAt: "2026-04-01T00:00:00.000Z" });
    expect(await repository.getForThread("parent")).not.toBeNull();
  });
});
