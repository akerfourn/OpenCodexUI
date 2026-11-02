import type { Database } from "better-sqlite3";
import type { CommandGroupsRepository } from "../../types/commandGroups.js";
import type { CachedProjectCommand } from "../../types/automation.js";
import { readProjectCommand } from "./projectCommandQueries.js";

/** Validates literal names independently of UI controls or legacy command writers. */
function groupName(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > 100) {
    throw new Error("Command group name must contain 1 to 100 characters.");
  }
  return value.trim();
}

/** Atomic project-local organization; command definitions, favorites and live runs are preserved. */
export class SqliteCommandGroupsRepository implements CommandGroupsRepository {
  /** Shares the database connection with command persistence. */
  constructor(private readonly database: Database) {}

  /** Lists empty and populated groups in saved creation order. */
  async list(projectId: string): Promise<string[]> {
    const rows = this.database.prepare("SELECT name FROM project_command_groups WHERE project_id = ? ORDER BY sort_order, name")
      .all(projectId) as { name: string }[];
    return rows.map(row => row.name);
  }

  /** Creates an empty group without needing a placeholder command. */
  async create(projectId: string, name: string): Promise<string[]> {
    const next = groupName(name);
    if (this.exists(projectId, next)) throw new Error("A command group with this name already exists.");
    this.database.prepare(`INSERT INTO project_command_groups (project_id, name, sort_order)
      VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM project_command_groups WHERE project_id = ?))`)
      .run(projectId, next, projectId);
    return await this.list(projectId);
  }

  /** Renames the group and all its memberships together, including favorite commands. */
  async rename(projectId: string, name: string, newName: string): Promise<string[]> {
    const next = groupName(newName);
    this.database.transaction(() => {
      if (!this.exists(projectId, name)) throw new Error("Command group no longer exists. Refresh the panel.");
      if (name === next) return;
      if (this.exists(projectId, next)) throw new Error("A command group with this name already exists.");
      this.database.prepare("UPDATE project_command_groups SET name = ? WHERE project_id = ? AND name = ?")
        .run(next, projectId, name);
      this.database.prepare("UPDATE project_commands SET group_name = ?, updated_at = ? WHERE project_id = ? AND group_name = ?")
        .run(next, new Date().toISOString(), projectId, name);
    })();
    return await this.list(projectId);
  }

  /** Removes only the group; its commands become ungrouped and keep their favorite/run state. */
  async delete(projectId: string, name: string): Promise<string[]> {
    this.database.transaction(() => {
      this.database.prepare("UPDATE project_commands SET group_name = NULL, updated_at = ? WHERE project_id = ? AND group_name = ?")
        .run(new Date().toISOString(), projectId, name);
      this.database.prepare("DELETE FROM project_command_groups WHERE project_id = ? AND name = ?").run(projectId, name);
    })();
    return await this.list(projectId);
  }

  /** Requires a current catalog selection and prevents assignment across project boundaries. */
  async assign(projectId: string, commandId: string, name: string | null): Promise<CachedProjectCommand> {
    const target = name === null ? null : groupName(name);
    this.database.transaction(() => {
      if (target !== null && !this.exists(projectId, target)) throw new Error("Command group no longer exists. Refresh the panel.");
      const result = this.database.prepare("UPDATE project_commands SET group_name = ?, updated_at = ? WHERE project_id = ? AND id = ?")
        .run(target, new Date().toISOString(), projectId, commandId);
      if (result.changes !== 1) throw new Error("Command does not belong to this project.");
    })();
    return await readProjectCommand(this.database, commandId);
  }

  /** Checks group identity within the explicit project, never a global selection. */
  private exists(projectId: string, name: string): boolean {
    return this.database.prepare("SELECT 1 FROM project_command_groups WHERE project_id = ? AND name = ?").get(projectId, name) !== undefined;
  }
}
