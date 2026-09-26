import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  DebugBreakpoint, DebugConfiguration, DebugPreferences, OpenCodexFileContext
} from "@open-codex-ui/opencodex-protocol";
import type { DebugRepository } from "../../types/debug.js";

/** Encodes all filesystem dimensions without separator collisions or path normalization. */
function contextKey(context: OpenCodexFileContext): string {
  return JSON.stringify([context.sourceId, context.projectId, context.workspaceId, context.workspacePath]);
}

/** Stores individual records so one workspace's edits never rewrite another's data. */
export class SqliteDebugRepository implements DebugRepository {
  /** Uses the shared application database; the facade owns its lifetime. */
  constructor(private readonly database: BetterSqliteDatabase) {}

  /** Returns fresh DTOs in insertion order, preserving the catalogue's display order. */
  async read(): Promise<DebugPreferences> {
    const configurations = this.database.prepare("SELECT data_json FROM debug_configurations ORDER BY rowid")
      .all() as { data_json: string }[];
    const breakpoints = this.database.prepare("SELECT data_json FROM debug_breakpoints ORDER BY rowid")
      .all() as { data_json: string }[];
    const watches = this.database.prepare("SELECT expression FROM debug_watches ORDER BY position, rowid")
      .all() as { expression: string }[];
    return {
      configurations: configurations.map(row => JSON.parse(row.data_json) as DebugConfiguration),
      breakpoints: breakpoints.map(row => JSON.parse(row.data_json) as DebugBreakpoint),
      watches: watches.map(row => row.expression)
    };
  }

  /** Commits the legacy data and marker together; retries cannot revive deleted records. */
  async importLegacy(preferences: DebugPreferences): Promise<void> {
    this.database.transaction(() => {
      const imported = this.database.prepare("SELECT name FROM debug_imports WHERE name = 'settings-json'").get();
      if (imported !== undefined) return;
      const configurationInsert = this.database.prepare(
        "INSERT INTO debug_configurations (id, context_key, data_json) VALUES (?, ?, ?) ON CONFLICT DO NOTHING"
      );
      for (const configuration of preferences.configurations) {
        configurationInsert.run(configuration.id, contextKey(configuration.context), JSON.stringify(configuration));
      }
      const breakpointInsert = this.database.prepare(
        "INSERT INTO debug_breakpoints (context_key, id, data_json) VALUES (?, ?, ?) ON CONFLICT DO NOTHING"
      );
      for (const breakpoint of preferences.breakpoints) {
        breakpointInsert.run(contextKey(breakpoint.context), breakpoint.id, JSON.stringify(breakpoint));
      }
      const watchInsert = this.database.prepare(
        "INSERT INTO debug_watches (expression, position) VALUES (?, ?) ON CONFLICT DO NOTHING"
      );
      preferences.watches.forEach((expression, position) => watchInsert.run(expression, position));
      this.database.prepare("INSERT INTO debug_imports (name) VALUES ('settings-json')").run();
    })();
  }

  /** Upserts only the selected configuration, preserving existing record order. */
  async saveConfiguration(configuration: DebugConfiguration): Promise<void> {
    this.database.prepare(`INSERT INTO debug_configurations (id, context_key, data_json) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET context_key = excluded.context_key, data_json = excluded.data_json`)
      .run(configuration.id, contextKey(configuration.context), JSON.stringify(configuration));
  }

  /** Deletes one profile without deleting its workspace's breakpoints. */
  async deleteConfiguration(id: string): Promise<void> {
    this.database.prepare("DELETE FROM debug_configurations WHERE id = ?").run(id);
  }

  /** Atomically replaces a single workspace context, including its captured path. */
  async replaceBreakpoints(context: OpenCodexFileContext, breakpoints: DebugBreakpoint[]): Promise<void> {
    const key = contextKey(context);
    for (const breakpoint of breakpoints) {
      if (contextKey(breakpoint.context) !== key) throw new Error("Breakpoint context does not match workspace.");
    }
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM debug_breakpoints WHERE context_key = ?").run(key);
      const insert = this.database.prepare(
        "INSERT INTO debug_breakpoints (context_key, id, data_json) VALUES (?, ?, ?)"
      );
      for (const breakpoint of breakpoints) insert.run(key, breakpoint.id, JSON.stringify(breakpoint));
    })();
  }

  /** Persists watch order and contents in one transaction. */
  async replaceWatches(expressions: string[]): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM debug_watches").run();
      const insert = this.database.prepare("INSERT INTO debug_watches (expression, position) VALUES (?, ?)");
      expressions.forEach((expression, position) => insert.run(expression, position));
    })();
  }
}
