import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedModelCatalog,
  CachedSource,
  CachedSourceCodexDetection,
  CachedSourceCreateInput,
  CachedSourceSettingsPatch
} from "../../types.js";
import type { SourceCacheRepository } from "../../types/repositoryTooling.js";
import {
  clearSourceAssociations,
  createSource,
  deleteSource,
  ensureDefaultSource,
  getSource,
  getSourceProjectCount,
  listSources,
  updateSource,
  updateSourceCodexDetection
} from "../sourceQueries.js";
import {
  getModelCatalog,
  saveModelCatalog
} from "../modelCatalogQueries.js";

/** Implements source cache operations with an existing SQLite database. */
export class SqliteSourceCacheRepository implements SourceCacheRepository {
  /** SQLite database used by the source queries. */
  private readonly database: BetterSqliteDatabase;

  /**
   * Creates a source cache repository.
   *
   * @param database Open SQLite database.
   */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /** Ensures a default source exists. */
  async ensureDefaultSource(): Promise<CachedSource> {
    return await ensureDefaultSource(this.database);
  }

  /** Creates a source. */
  async createSource(name = "Codex", input: CachedSourceCreateInput = { kind: "local" }): Promise<CachedSource> {
    return await createSource(this.database, name, input);
  }

  /** Lists configured sources. */
  async listSources(): Promise<CachedSource[]> {
    return await listSources(this.database);
  }

  /** Reads a source by identifier. */
  async getSource(sourceId: string): Promise<CachedSource | null> {
    return await getSource(this.database, sourceId);
  }

  /** Counts projects associated with a source. */
  async getSourceProjectCount(sourceId: string): Promise<number> {
    return await getSourceProjectCount(this.database, sourceId);
  }

  /** Updates a source. */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: CachedSourceSettingsPatch;
    }
  ): Promise<CachedSource> {
    return await updateSource(this.database, sourceId, patch);
  }

  /** Stores the latest Codex CLI detection result for a source. */
  async updateSourceCodexDetection(
    sourceId: string,
    detection: CachedSourceCodexDetection
  ): Promise<void> {
    await updateSourceCodexDetection(this.database, sourceId, detection);
  }

  /** Deletes a source. */
  async deleteSource(sourceId: string): Promise<void> {
    await deleteSource(this.database, sourceId);
  }

  /** Clears project and thread references to a source. */
  async clearSourceAssociations(sourceId: string): Promise<void> {
    await clearSourceAssociations(this.database, sourceId);
  }

  /** Reads the latest cached model catalog for one source. */
  async getModelCatalog(sourceId: string): Promise<CachedModelCatalog | null> {
    return getModelCatalog(this.database, sourceId);
  }

  /** Stores the latest serialized model catalog for one source. */
  async saveModelCatalog(sourceId: string, modelsJson: string): Promise<void> {
    saveModelCatalog(this.database, sourceId, modelsJson);
  }
}
