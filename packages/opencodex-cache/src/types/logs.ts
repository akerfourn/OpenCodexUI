import type { CachedLogType } from "./foundations.js";

/**
 * Persisted application log entry.
 */
export type CachedLogEntry = {
  id: string;
  type: CachedLogType;
  message: string;
  details: unknown;
  createdAt: string;
};

/**
 * Pagination query for reading application logs.
 */
export type CachedLogListQuery = {
  beforeCreatedAt?: string | null;
  limit: number;
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
};
