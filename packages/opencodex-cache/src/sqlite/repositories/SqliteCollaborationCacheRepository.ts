import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type { OpenCodexCollaborationEvent } from "@open-codex-ui/opencodex-protocol";

import type {
  CachedCollaborationEvent,
  CachedCollaborationEventQuery
} from "../../types.js";
import type { CollaborationCacheRepository } from "../../types/repositoryProjects.js";
import {
  listCollaborationEvents,
  upsertCollaborationEvent
} from "../collaborationEventQueries.js";

/** Implements collaboration cache operations with an existing SQLite database. */
export class SqliteCollaborationCacheRepository implements CollaborationCacheRepository {
  /** SQLite database used by the collaboration queries. */
  private readonly database: BetterSqliteDatabase;

  /**
   * Creates a collaboration cache repository.
   *
   * @param database Open SQLite database.
   */
  constructor(database: BetterSqliteDatabase) {
    this.database = database;
  }

  /** Inserts or enriches one normalized collaboration event. */
  async upsertCollaborationEvent(
    event: OpenCodexCollaborationEvent
  ): Promise<CachedCollaborationEvent> {
    return upsertCollaborationEvent(this.database, event);
  }

  /** Lists collaboration events matching source-aware routing filters. */
  async listCollaborationEvents(
    query: CachedCollaborationEventQuery
  ): Promise<CachedCollaborationEvent[]> {
    return listCollaborationEvents(this.database, query);
  }
}
