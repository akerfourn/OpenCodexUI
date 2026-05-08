/**
 * Declares the cache repository contracts and persisted thread/project shapes.
 */
export type CachedThreadScope = "currentProject" | "all";

export type CachedThreadSummary = {
  id: string;
  codexTitle: string;
  customTitle: string | null;
  title: string;
  preview: string;
  model: string | null;
  reasoningEffort: "low" | "medium" | "high" | "xhigh" | null;
  projectName: string | null;
  projectPath: string | null;
  branchName: string | null;
  updatedAt: string | null;
  status?: string;
};

export type CachedProject = {
  id: string;
  path: string;
  defaultName: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
};

export type CachedThreadSyncState = {
  threadId: string;
  newestTurnId: string | null;
  oldestTurnId: string | null;
  olderCursor: string | null;
  hasLoadedLatest: boolean;
  hasLoadedAllOlderTurns: boolean;
  lastSyncedAt: string | null;
};

export type CachedThreadSnapshot = {
  thread: CachedThreadSummary;
  turns: unknown[];
  syncState: CachedThreadSyncState;
};

export type CachedThreadReadOptions = {
  latestTurnLimit?: number | null;
};

export type CachedOlderTurnsQuery = {
  threadId: string;
  beforeTurnId: string;
  limit: number;
};

export type CachedOlderTurnsResult = {
  turns: unknown[];
  hasMoreOlderTurns: boolean;
};

export type CachedThreadDelta = {
  threadId: string;
  turns: unknown[];
  syncState: CachedThreadSyncState;
};

export type ThreadListCacheQuery = {
  scope: CachedThreadScope;
  currentProjectPath: string | null;
  searchTerm?: string | null;
};

/**
 * Describes the storage contract implemented by cache backends.
 */
export interface OpenCodexCacheRepository {
  upsertProject(projectPath: string): Promise<CachedProject>;
  listProjects(): Promise<CachedProject[]>;
  upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void>;
  updateThreadTitle(threadId: string, title: string): Promise<void>;
  updateThreadCodexTitle(threadId: string, title: string): Promise<void>;
  deleteThread(threadId: string): Promise<void>;
  listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]>;
  getThread(threadId: string, options?: CachedThreadReadOptions): Promise<CachedThreadSnapshot | null>;
  getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult>;
  saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void>;
  saveThreadDelta(delta: CachedThreadDelta): Promise<void>;
  getSyncState(threadId: string): Promise<CachedThreadSyncState | null>;
  close(): Promise<void>;
}
