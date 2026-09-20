import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { applySchemaMigrationV40 } from "../src/sqlite/migrations/v40";

it("should migrate legacy command limits without changing existing UI behavior", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE project_commands (id TEXT PRIMARY KEY, allow_parallel INTEGER NOT NULL);
      INSERT INTO project_commands VALUES ('serial', 0), ('parallel', 1);
    `);
    applySchemaMigrationV40(database);
    expect(database.prepare("SELECT id, execution_mode FROM project_commands ORDER BY id").all())
      .toEqual([{ id: "parallel", execution_mode: "parallel" }, { id: "serial", execution_mode: "project" }]);
    database.exec("UPDATE project_commands SET execution_mode = 'workspace' WHERE id = 'serial'");
    applySchemaMigrationV40(database);
    expect(database.prepare("SELECT execution_mode FROM project_commands WHERE id = 'serial'").get())
      .toEqual({ execution_mode: "workspace" });
    expect(database.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 40").get())
      .toEqual({ count: 1 });
  } finally {
    database.close();
  }
});
