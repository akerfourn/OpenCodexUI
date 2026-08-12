import type { OpenCodexSubAgentSource } from "@open-codex-ui/opencodex-protocol";

import type { CachedThreadScope } from "./foundations.js";
import type { CachedThreadTokenUsage } from "./usage.js";

/**
 * Cached summary row used to list and identify Codex threads.
 */
export type CachedThreadSummary = {
  id: string;
  sessionId: string | null;
  parentThreadId: string | null;
  sourceId: string | null;
  codexTitle: string;
  customTitle: string | null;
  title: string;
  preview: string;
  model: string | null;
  reasoningEffort: string | null;
  projectName: string | null;
  projectPath: string | null;
  projectHidden?: boolean;
  branchName: string | null;
  updatedAt: string | null;
  isArchived: boolean;
  threadSource: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  subAgentSource: OpenCodexSubAgentSource | null;
  canAcceptDirectInput: boolean | null;
  status?: string;
};

/**
 * Synchronization metadata for incremental thread cache loading.
 */
export type CachedThreadSyncState = {
  threadId: string;
  newestTurnId: string | null;
  oldestTurnId: string | null;
  olderCursor: string | null;
  hasLoadedLatest: boolean;
  hasLoadedAllOlderTurns: boolean;
  lastSyncedAt: string | null;
};

/**
 * Full cached thread payload returned to the backend.
 */
export type CachedThreadSnapshot = {
  thread: CachedThreadSummary;
  turns: unknown[];
  syncState: CachedThreadSyncState;
  tokenUsage: CachedThreadTokenUsage | null;
};

/**
 * Options controlling cached thread reads.
 */
export type CachedThreadReadOptions = {
  latestTurnLimit?: number | null;
};

/**
 * Query for reading cached turns older than a known cursor turn.
 */
export type CachedOlderTurnsQuery = {
  threadId: string;
  beforeTurnId: string;
  limit: number;
};

/**
 * Page of older cached turns.
 */
export type CachedOlderTurnsResult = {
  turns: unknown[];
  hasMoreOlderTurns: boolean;
};

/**
 * Incremental thread update persisted after live or background sync.
 */
export type CachedThreadDelta = {
  threadId: string;
  turns: unknown[];
  syncState: CachedThreadSyncState;
};

/**
 * Query used to list cached thread summaries.
 */
export type ThreadListCacheQuery = {
  scope: CachedThreadScope;
  currentProjectPath: string | null;
  sourceId?: string | null;
  searchTerm?: string | null;
  isArchived?: boolean;
};
