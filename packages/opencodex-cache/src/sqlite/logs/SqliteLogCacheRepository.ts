import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedLogCreateInput,
  CachedLogEntry,
  CachedLogListQuery,
  CachedLogPage
} from "../../types.js";
import type { LogCacheRepository } from "../../types/repositoryProjects.js";
import {
  clearLogs,
  clearLogsOlderThan,
  createLog,
  deleteLog,
  listLogs
} from "./logQueries.js";

/** Implements application log cache operations with an existing SQLite database. */
export class SqliteLogCacheRepository implements LogCacheRepository {
  /** SQLite database used by the log queries. */
  private readonly database: BetterSqliteDatabase;

  /**
   * Creates a log cache repository.
   *
   * @param database Open SQLite database.
   */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /** Creates an application log entry. */
  async createLog(input: CachedLogCreateInput): Promise<CachedLogEntry> {
    return await createLog(this.database, input);
  }

  /** Lists application logs. */
  async listLogs(query: CachedLogListQuery): Promise<CachedLogPage> {
    return await listLogs(this.database, query);
  }

  /** Deletes one application log entry. */
  async deleteLog(logId: string): Promise<void> {
    await deleteLog(this.database, logId);
  }

  /** Deletes all application logs. */
  async clearLogs(): Promise<void> {
    await clearLogs(this.database);
  }

  /** Deletes application logs older than the provided timestamp. */
  async clearLogsOlderThan(createdBefore: string): Promise<void> {
    await clearLogsOlderThan(this.database, createdBefore);
  }
}
