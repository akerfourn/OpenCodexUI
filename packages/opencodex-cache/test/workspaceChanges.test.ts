import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/sqlite/migrations";
import { applySchemaMigrationV51 } from "../src/sqlite/migrations/v51";
import { SqliteWorkspaceCacheRepository } from "../src/sqlite/projects/SqliteWorkspaceCacheRepository";

let database: Database.Database;
let repository: SqliteWorkspaceCacheRepository;
let input: { projectId: string; workspaceId: string; sourceId: string; workspacePath: string;
  fingerprint: string; hasChanges: boolean; checkedAt: string };

beforeEach(async () => {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  repository = new SqliteWorkspaceCacheRepository(database);
  const workspace = await repository.resolvePath("/repo", "source");
  input = { projectId: workspace.projectId, workspaceId: workspace.id, sourceId: "source", workspacePath: workspace.path,
    fingerprint: "a".repeat(64), hasChanges: false, checkedAt: "2026-10-01T12:00:00Z" };
});
afterEach(() => database.close());

describe("persistent change observations", () => {
  it("should add an idempotent migration without inventing past activity or rewriting existing data", async () => {
    database.exec("DROP TABLE workspace_change_observations; DELETE FROM schema_migrations WHERE version = 51");
    const previous = await repository.list(input.projectId);
    applySchemaMigrationV51(database);
    applySchemaMigrationV51(database);
    expect(await repository.list(input.projectId)).toEqual(previous);
    expect(await repository.changes.get(input.workspaceId)).toBeNull();
    expect((await repository.activity(input.projectId))[0]?.lastActivityAt).toBeNull();
  });

  it("should compare against a baseline, keep stable dates, and retain cached observations after reconstruction", async () => {
    expect(await repository.changes.observe(input)).toMatchObject({ state: "checked", lastChangedAt: null });
    const changed = { ...input, fingerprint: "b".repeat(64), checkedAt: "2026-10-02T12:00:00Z" };
    expect(await repository.changes.observe(changed)).toMatchObject({ lastChangedAt: changed.checkedAt });
    const later = { ...changed, checkedAt: "2026-10-03T12:00:00Z" };
    expect(await repository.changes.observe(later)).toMatchObject({ checkedAt: later.checkedAt, lastChangedAt: changed.checkedAt });
    repository = new SqliteWorkspaceCacheRepository(database);
    expect(await repository.changes.get(input.workspaceId)).toMatchObject({ state: "cached", lastChangedAt: changed.checkedAt });
    database.exec("DELETE FROM schema_migrations WHERE version = 51");
    applySchemaMigrationV51(database);
    expect(await repository.changes.get(input.workspaceId)).toMatchObject({ lastChangedAt: changed.checkedAt });
  });

  it("should require a new baseline after relocation and reject late old-path replies", async () => {
    await repository.changes.observe(input);
    await repository.changes.observe({ ...input, fingerprint: "b".repeat(64), checkedAt: "2026-10-02T12:00:00Z" });
    await repository.relocate(input.workspaceId, "/moved");
    expect(await repository.changes.get(input.workspaceId)).toBeNull();
    await expect(repository.changes.observe(input)).rejects.toThrow("Workspace changed");
    expect(await repository.changes.observe({ ...input, workspacePath: "/moved", fingerprint: "c".repeat(64), checkedAt: "2026-10-03T12:00:00Z" }))
      .toMatchObject({ lastChangedAt: "2026-10-02T12:00:00Z" });
  });

  it.each(["source", "project", "fingerprint", "time"])("should reject invalid %s observations without losing the baseline", async reason => {
    await repository.changes.observe(input);
    const invalid = { ...input };
    if (reason === "source") invalid.sourceId = "other";
    if (reason === "project") invalid.projectId = "other";
    if (reason === "fingerprint") invalid.fingerprint = "invalid";
    if (reason === "time") invalid.checkedAt = "invalid";
    await expect(repository.changes.observe(invalid)).rejects.toThrow(/Workspace changed|Invalid/);
    expect(await repository.changes.get(input.workspaceId)).toMatchObject({ checkedAt: input.checkedAt, lastChangedAt: null });
  });

  it("should refuse a backwards clock instead of overwriting newer activity evidence", async () => {
    await repository.changes.observe(input);
    await expect(repository.changes.observe({ ...input, checkedAt: "2026-09-01T12:00:00Z" })).rejects.toThrow("backwards");
  });
});
