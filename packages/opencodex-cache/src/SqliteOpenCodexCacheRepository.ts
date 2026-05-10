/**
 * Provides the public SQLite-backed cache repository facade.
 */
import fs from "node:fs";
import path from "node:path";

import Database, { type Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedOlderTurnsQuery,
  CachedOlderTurnsResult,
  CachedProject,
  CachedSource,
  CachedSourceLocalSettings,
  CachedThreadDelta,
  CachedThreadReadOptions,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  OpenCodexCacheRepository,
  ThreadListCacheQuery
} from "./types.js";
import { runMigrations } from "./sqlite/migrations.js";
import {
  clearSourceAssociations,
  createSource,
  deleteSource,
  ensureDefaultSource,
  getSource,
  getSourceProjectCount,
  listSources,
  updateSource
} from "./sqlite/sourceQueries.js";
import {
  listProjects,
  setProjectHidden,
  upsertProject
} from "./sqlite/projectQueries.js";
import {
  deleteThread,
  getOlderTurns,
  getSyncState,
  getThread,
  listThreads,
  saveThreadDelta,
  saveThreadSnapshot,
  updateThreadCodexTitle,
  updateThreadTitle,
  upsertThreadIndex
} from "./sqlite/threadQueries.js";

export type SqliteOpenCodexCacheRepositoryOptions = {
  directory: string;
  fileName?: string;
};

/**
 * Creates the SQLite-backed cache repository used by the desktop application.
 *
 * @param options Directory and optional file name for the SQLite database.
 * @returns Cache repository implementation backed by SQLite.
 */
export function createOpenCodexSqliteCacheRepository(
  options: SqliteOpenCodexCacheRepositoryOptions
): OpenCodexCacheRepository {
  return new SqliteOpenCodexCacheRepository(options);
}

/**
 * Implements the thread cache contract with a local SQLite database.
 */
export class SqliteOpenCodexCacheRepository implements OpenCodexCacheRepository {
  private readonly database: BetterSqliteDatabase;

  /**
   * Opens the SQLite database, configures pragmas, and runs migrations.
   *
   * @param options Directory and optional file name for the database file.
   */
  constructor(options: SqliteOpenCodexCacheRepositoryOptions) {
    fs.mkdirSync(options.directory, { recursive: true });

    const fileName = options.fileName ?? "opencodex-cache.sqlite";
    this.database = new Database(path.join(options.directory, fileName));
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    runMigrations(this.database);
  }

  async ensureDefaultSource(): Promise<CachedSource> {
    return await ensureDefaultSource(this.database);
  }

  async createSource(name = "Codex"): Promise<CachedSource> {
    return await createSource(this.database, name);
  }

  async listSources(): Promise<CachedSource[]> {
    return await listSources(this.database);
  }

  async getSource(sourceId: string): Promise<CachedSource | null> {
    return await getSource(this.database, sourceId);
  }

  async getSourceProjectCount(sourceId: string): Promise<number> {
    return await getSourceProjectCount(this.database, sourceId);
  }

  async updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: Partial<CachedSourceLocalSettings>;
    }
  ): Promise<CachedSource> {
    return await updateSource(this.database, sourceId, patch);
  }

  async deleteSource(sourceId: string): Promise<void> {
    await deleteSource(this.database, sourceId);
  }

  async clearSourceAssociations(sourceId: string): Promise<void> {
    await clearSourceAssociations(this.database, sourceId);
  }

  async upsertProject(projectPath: string, sourceId: string | null = null): Promise<CachedProject> {
    return await upsertProject(this.database, projectPath, sourceId);
  }

  async listProjects(): Promise<CachedProject[]> {
    return await listProjects(this.database);
  }

  async setProjectHidden(projectId: string, isHidden: boolean): Promise<void> {
    await setProjectHidden(this.database, projectId, isHidden);
  }

  async upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void> {
    await upsertThreadIndex(this.database, threads);
  }

  async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await updateThreadTitle(this.database, threadId, title);
  }

  async updateThreadCodexTitle(threadId: string, title: string): Promise<void> {
    await updateThreadCodexTitle(this.database, threadId, title);
  }

  async deleteThread(threadId: string): Promise<void> {
    await deleteThread(this.database, threadId);
  }

  async listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]> {
    return await listThreads(this.database, query);
  }

  async getThread(
    threadId: string,
    options: CachedThreadReadOptions = {}
  ): Promise<CachedThreadSnapshot | null> {
    return await getThread(this.database, threadId, options);
  }

  async getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult> {
    return await getOlderTurns(this.database, query);
  }

  async saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void> {
    await saveThreadSnapshot(this.database, snapshot);
  }

  async saveThreadDelta(delta: CachedThreadDelta): Promise<void> {
    await saveThreadDelta(this.database, delta);
  }

  async getSyncState(threadId: string): Promise<CachedThreadSyncState | null> {
    return await getSyncState(this.database, threadId);
  }

  async close(): Promise<void> {
    this.database.pragma("wal_checkpoint(TRUNCATE)");
    this.database.close();
  }
}

