import type { Database } from "better-sqlite3";

/** Separates generated rule-file state by physical location while retaining legacy rows. */
export function applySchemaMigrationV31(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 31").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    database.exec(`
      CREATE TABLE workspace_rule_file_states (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        generated_hash TEXT,
        generated_path TEXT,
        updated_at TEXT NOT NULL
      );
      INSERT INTO workspace_rule_file_states SELECT * FROM project_command_rule_file_states;
      DROP TABLE project_command_rule_file_states;
      ALTER TABLE workspace_rule_file_states RENAME TO project_command_rule_file_states;
      CREATE UNIQUE INDEX project_rule_file_location
        ON project_command_rule_file_states(project_id, COALESCE(generated_path, ''));
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (31, ?)").run(new Date().toISOString());
  })();
}
