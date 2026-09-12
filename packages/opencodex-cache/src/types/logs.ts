import type { CachedLogCategory, CachedLogType } from "./foundations.js";

/**
 * Persisted application log entry.
 */
export type CachedLogEntry = {
  id: string;
  type: CachedLogType;
  message: string;
  details: unknown;
  createdAt: string;
  /** Optional semantic category used by retention policies. */
  category?: CachedLogCategory;
};

/**
 * Pagination query for reading application logs.
 */
export type CachedLogListQuery = {
  beforeCreatedAt?: string | null;
  /** Optional id tie-breaker for entries sharing the cursor timestamp. */
  beforeId?: string | null;
  limit: number;
  /** Optional severities to include in the page. */
  types?: CachedLogType[];
};

/**
 * Page of application logs.
 */
export type CachedLogPage = {
  logs: CachedLogEntry[];
  hasMore: boolean;
};

/**
 * Input payload used to create an application log entry.
 */
export type CachedLogCreateInput = {
  type: CachedLogType;
  message: string;
  details?: unknown;
  /** Optional semantic category used by retention policies. */
  category?: CachedLogCategory;
};

/** Optional filters applied while deleting logs older than a cutoff. */
export type CachedLogClearFilter = {
  type?: CachedLogType;
  category?: CachedLogCategory;
  excludeCategory?: CachedLogCategory;
};
