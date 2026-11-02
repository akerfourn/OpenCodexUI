import type { Database } from "better-sqlite3";

/** Preserves existing memberships while allowing persistent empty groups and legacy command writes. */
export function applySchemaMigrationV52(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 52").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_command_groups (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
        sort_order INTEGER NOT NULL,
        PRIMARY KEY(project_id, name)
      );
    `);
    const commandsTable = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_commands'"
    ).get();
    if (commandsTable !== undefined) registerExistingCommandGroups(database);
    database.prepare("INSERT INTO schema_migrations VALUES (52, ?)").run(new Date().toISOString());
  })();
}

/** Registers memberships only when the command feature exists in the migrated database. */
function registerExistingCommandGroups(database: Database): void {
  database.exec(`
    INSERT OR IGNORE INTO project_command_groups (project_id, name, sort_order)
      SELECT project_id, group_name, MIN(sort_order) FROM project_commands
      WHERE group_name IS NOT NULL GROUP BY project_id, group_name;
    CREATE TRIGGER IF NOT EXISTS register_command_group_insert AFTER INSERT ON project_commands
    WHEN NEW.group_name IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO project_command_groups (project_id, name, sort_order)
      VALUES (NEW.project_id, NEW.group_name,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM project_command_groups WHERE project_id = NEW.project_id));
    END;
    CREATE TRIGGER IF NOT EXISTS register_command_group_update AFTER UPDATE OF group_name ON project_commands
    WHEN NEW.group_name IS NOT NULL
    BEGIN
      INSERT OR IGNORE INTO project_command_groups (project_id, name, sort_order)
      VALUES (NEW.project_id, NEW.group_name,
        (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM project_command_groups WHERE project_id = NEW.project_id));
    END;
  `);
}
