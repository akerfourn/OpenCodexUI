import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV43 } from "../src/sqlite/migrations/v43";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";

describe("workspace removal persistence", () => {
  let database: Database.Database;
  let workspaces: SqliteWorkspaceCacheRepository;
  let primary: OpenCodexProjectWorkspace;
  let secondary: OpenCodexProjectWorkspace;

  beforeEach(async () => {
    database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    runMigrations(database);
    workspaces = new SqliteWorkspaceCacheRepository(database);
    primary = await workspaces.resolvePath("/repo", "source");
    const creation = await workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: primary.path, repositoryPath: "/repo/.git", destinationPath: "/secondary",
      start: { mode: "newBranch", branchName: "topic", startPoint: "HEAD" } });
    await workspaces.creations.submitting(creation.id, "a".repeat(40), "refs/heads/topic");
    await workspaces.creations.confirmGit(creation.id);
    secondary = (await workspaces.get(await workspaces.creations.commit(creation.id)))!;
    database.prepare(`INSERT INTO threads (id, project_id, source_id, cwd, current_workspace_id, title)
      VALUES ('thread', ?, 'source', '/secondary', ?, 'retained')`).run(primary.projectId, secondary.id);
  });

  afterEach(() => database.close());

  /** Reserves the verified source and repository without performing filesystem work. */
  async function begin() {
    return await workspaces.removals.begin(primary.projectId, secondary.id, "source", primary.id, "/repo/.git");
  }

  it("should apply migration idempotently without rewriting existing workspaces or threads", async () => {
    const previous = await workspaces.list(primary.projectId);
    applySchemaMigrationV43(database);
    runMigrations(database);
    expect(await workspaces.list(primary.projectId)).toEqual(previous);
    expect(database.prepare("SELECT title FROM threads WHERE id = 'thread'").get()).toEqual({ title: "retained" });
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("should retain Compose usage in SQLite and prevent usage changes during removal", async () => {
    await workspaces.markComposeUsed(secondary.id);
    workspaces = new SqliteWorkspaceCacheRepository(database);
    expect(await workspaces.get(secondary.id)).toMatchObject({ composeUsed: true });
    await begin();
    await expect(workspaces.markComposeUsed(secondary.id)).rejects.toThrow("pending removal");
  });

  it("should reject primary, external, foreign-source and foreign-project deletion", async () => {
    await expect(workspaces.removals.begin(primary.projectId, primary.id, "source", primary.id, "/repo/.git"))
      .rejects.toThrow("managed secondary");
    await expect(workspaces.removals.begin("other-project", secondary.id, "source", primary.id, "/repo/.git"))
      .rejects.toThrow("managed secondary");
    await expect(workspaces.removals.begin(primary.projectId, secondary.id, "other-source", primary.id, "/repo/.git"))
      .rejects.toThrow("managed secondary");
    database.prepare("UPDATE project_workspaces SET managed = 0 WHERE id = ?").run(secondary.id);
    await expect(begin()).rejects.toThrow("managed secondary");
  });

  it("should refuse removal while execution or a transition is reserved", async () => {
    const reservation = await workspaces.reserve(secondary.id, "thread");
    await expect(begin()).rejects.toThrow("unresolved execution");
    await workspaces.release(reservation.id);
    await workspaces.transitions.begin("thread", primary.id);
    await expect(begin()).rejects.toThrow("transition");
  });

  it("should guard execution, transitions, relocation and repository creation until cancellation", async () => {
    const removal = await begin();
    expect(await workspaces.get(secondary.id)).toMatchObject({ removalPending: true });
    await expect(workspaces.reserve(secondary.id, "thread")).rejects.toThrow("pending removal");
    await expect(workspaces.transitions.begin("thread", primary.id)).rejects.toThrow("pending removal");
    await expect(workspaces.relocate(primary.id, "/moved")).rejects.toThrow("pending removal");
    await expect(workspaces.creations.begin({ primaryWorkspaceId: primary.id, sourceId: "source",
      projectPath: primary.path, repositoryPath: "/repo/.git", destinationPath: "/third",
      start: { mode: "detached", startPoint: "HEAD" } })).rejects.toThrow("pending workspace removal");
    await workspaces.removals.cancel(removal.id);
    expect((await workspaces.get(secondary.id))?.removalPending).toBeUndefined();
  });

  it("should preserve conversation associations and immutable turn context after logical removal", async () => {
    const reservation = await workspaces.reserve(secondary.id, "thread");
    await workspaces.submitting(reservation.id);
    await workspaces.acknowledge(reservation.id, "turn");
    await workspaces.observeTurn("source", "thread", "turn", true);
    const history = await workspaces.listTurnContexts("thread");
    const removal = await begin();
    await workspaces.removals.submitting(removal.id);
    await workspaces.removals.confirmGit(removal.id, 0);
    await workspaces.removals.commit(removal.id);
    expect(await workspaces.getForThread("thread")).toMatchObject({ id: secondary.id, removedAt: expect.any(String) });
    expect(await workspaces.listTurnContexts("thread")).toEqual(history);
    expect(history).toHaveLength(1);
    await expect(workspaces.reserve(secondary.id, "thread")).rejects.toThrow("removed");
  });

  it("should retain ambiguous dispatch and reject unsafe cancellation", async () => {
    const removal = await begin();
    await workspaces.removals.submitting(removal.id);
    await workspaces.removals.fail(removal.id);
    await expect(workspaces.removals.cancel(removal.id)).rejects.toThrow("cannot be cancelled");
    expect(await workspaces.removals.get(removal.id)).toMatchObject({ state: "uncertain", gitExitCode: null });
  });
});
