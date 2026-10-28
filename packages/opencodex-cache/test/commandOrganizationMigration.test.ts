import Database from "better-sqlite3";
import { it, expect } from "vitest";
import { applySchemaMigrationV49 } from "../src/sqlite/migrations/v49";

it("should retain legacy commands and replay without discarding organization", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE project_commands (id TEXT PRIMARY KEY, command TEXT NOT NULL);
      INSERT INTO project_commands VALUES ('build', 'npm run build');`);
    applySchemaMigrationV49(database);
    expect(database.prepare("SELECT * FROM project_commands").get())
      .toEqual({ id: "build", command: "npm run build", group_name: null, is_favorite: 0 });
    database.exec("UPDATE project_commands SET group_name = 'Build', is_favorite = 1; DELETE FROM schema_migrations WHERE version = 49");
    applySchemaMigrationV49(database);
    expect(database.prepare("SELECT group_name, is_favorite FROM project_commands").get())
      .toEqual({ group_name: "Build", is_favorite: 1 });
  } finally { database.close(); }
});
