import type { Database } from "better-sqlite3";

/** Distinguishes personal conversation environments without changing existing project ownership. */
export function applySchemaMigrationV56(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 56").get() !== undefined) return;
  database.transaction(() => {
    const columns = database.pragma("table_info(projects)") as { name: string }[];
    if (!columns.some((column) => column.name === "kind")) {
      database.exec(`ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'project'
        CHECK(kind IN ('project', 'discussion'));`);
    }
    if (!columns.some((column) => column.name === "discussion_key")) {
      database.exec("ALTER TABLE projects ADD COLUMN discussion_key TEXT;");
    }
    if (!columns.some((column) => column.name === "discussion_creation_cancelled")) {
      database.exec(`ALTER TABLE projects ADD COLUMN discussion_creation_cancelled INTEGER NOT NULL DEFAULT 0
        CHECK(discussion_creation_cancelled IN (0, 1));`);
    }
    if (!columns.some((column) => column.name === "discussion_thread_id")) {
      database.exec("ALTER TABLE projects ADD COLUMN discussion_thread_id TEXT;");
    }
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS projects_discussion_key ON projects(discussion_key)
        WHERE discussion_key IS NOT NULL;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (56, ?)").run(new Date().toISOString());
  })();
}
