import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DebugPreferences } from "@open-codex-ui/opencodex-protocol";
import { runMigrations } from "../src/sqlite/migrations.js";
import { SqliteDebugRepository } from "../src/sqlite/debug/SqliteDebugRepository.js";

const context = { sourceId: "local", projectId: "project", workspaceId: "primary", workspacePath: "/project" };
const preferences: DebugPreferences = {
  configurations: [{ id: "node", name: "API", adapter: "javascript", target: "node", request: "launch",
    program: "dist/index.js", args: ["--port", "3000"], context }],
  breakpoints: [{ id: "breakpoint", context, path: "src/index.ts", line: 8, enabled: true, condition: "count > 0" }],
  watches: ["count", "request.url"]
};

describe("debug persistence", () => {
  let database: Database.Database;
  let repository: SqliteDebugRepository;
  beforeEach(() => {
    database = new Database(":memory:");
    runMigrations(database);
    repository = new SqliteDebugRepository(database);
  });
  afterEach(() => database.close());

  it("should retain all legacy data across repeated schema migrations and repository recreation", async () => {
    await repository.importLegacy(preferences);
    runMigrations(database);
    expect(await new SqliteDebugRepository(database).read()).toEqual(preferences);
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 41").get())
      .toEqual({ count: 1 });
  });

  it("should never replay legacy JSON over edits or deletions when cleanup is retried", async () => {
    await repository.importLegacy(preferences);
    await repository.deleteConfiguration("node");
    await repository.replaceBreakpoints(context, []);
    await repository.replaceWatches(["newExpression"]);
    await repository.importLegacy(preferences);
    expect(await repository.read()).toEqual({ configurations: [], breakpoints: [], watches: ["newExpression"] });
  });

  it("should preserve existing database profiles when first importing legacy JSON", async () => {
    const updated = { ...preferences.configurations[0], name: "New name" };
    await repository.saveConfiguration(updated);
    await repository.importLegacy(preferences);
    expect((await repository.read()).configurations).toEqual([updated]);
  });

  it("should keep identical breakpoint IDs and paths separate in every filesystem context", async () => {
    const contexts = [context, { ...context, sourceId: "other-source" },
      { ...context, projectId: "other-project" }, { ...context, workspaceId: "other-workspace" },
      { ...context, workspacePath: "/moved" }];
    for (const entry of contexts) {
      await repository.replaceBreakpoints(entry, [{ ...preferences.breakpoints[0], context: entry }]);
    }
    await repository.replaceBreakpoints(context, []);
    expect((await repository.read()).breakpoints.map(item => item.context)).toEqual(contexts.slice(1));
    await expect(repository.replaceBreakpoints(context, [{ ...preferences.breakpoints[0], context: contexts[1] }]))
      .rejects.toThrow("Breakpoint context does not match workspace");
    expect((await repository.read()).breakpoints).toHaveLength(4);
  });

  it("should roll back replacement when a database write fails", async () => {
    await repository.importLegacy(preferences);
    database.exec(`CREATE TRIGGER fail_debug_write BEFORE INSERT ON debug_breakpoints
      BEGIN SELECT RAISE(ABORT, 'Disk write failed'); END;`);
    await expect(repository.replaceBreakpoints(context, [{ ...preferences.breakpoints[0], line: 20 }]))
      .rejects.toThrow("Disk write failed");
    expect(await repository.read()).toEqual(preferences);
  });

  it("should roll back legacy import and its marker together so it can be retried", async () => {
    database.exec(`CREATE TRIGGER fail_debug_import BEFORE INSERT ON debug_watches
      BEGIN SELECT RAISE(ABORT, 'Disk write failed'); END;`);
    await expect(repository.importLegacy(preferences)).rejects.toThrow("Disk write failed");
    expect(await repository.read()).toEqual({ configurations: [], breakpoints: [], watches: [] });
    expect(database.prepare("SELECT * FROM debug_imports").all()).toEqual([]);
    database.exec("DROP TRIGGER fail_debug_import");
    await repository.importLegacy(preferences);
    expect(await repository.read()).toEqual(preferences);
  });
});
