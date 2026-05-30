/**
 * Declares the cache repository contracts and persisted thread/project shapes.
 */
export type CachedThreadScope = "currentProject" | "all";
export type CachedSourceColor = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "teal";
export type CachedLogType = "error" | "warning" | "info";

export type CachedThreadSummary = {
  id: string;
  sourceId: string | null;
  codexTitle: string;
  customTitle: string | null;
  title: string;
  preview: string;
  model: string | null;
  reasoningEffort: "low" | "medium" | "high" | "xhigh" | null;
  projectName: string | null;
  projectPath: string | null;
  projectHidden?: boolean;
  branchName: string | null;
  updatedAt: string | null;
  status?: string;
};

export type CachedProject = {
  id: string;
  sourceId: string | null;
  path: string;
  defaultName: string;
  displayName: string | null;
  isHidden: boolean;
  preferences: CachedProjectPreferences;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
};

export type CachedProjectPreferences = {
  git?: {
    referenceTagName?: string | null;
  };
};

export type CachedLogEntry = {
  id: string;
  type: CachedLogType;
  message: string;
  details: unknown;
  createdAt: string;
};

export type CachedLogListQuery = {
  beforeCreatedAt?: string | null;
  limit: number;
};

export type CachedLogPage = {
  logs: CachedLogEntry[];
  hasMore: boolean;
};

export type CachedLogCreateInput = {
  type: CachedLogType;
  message: string;
  details?: unknown;
};

export type CachedProjectCommand = {
  id: string;
  projectId: string;
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CachedProjectCommandCreateInput = {
  projectId: string;
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
};

export type CachedProjectCommandUpdateInput = {
  name?: string;
  command?: string;
  allowParallel?: boolean;
  persistLogs?: boolean;
};

export type CachedSourceCommandMode = "auto" | "custom";

export type CachedSourceLocalSettings = {
  commandMode: CachedSourceCommandMode;
  command: string | null;
  color: CachedSourceColor;
  openFolderCommand: string | null;
  openFileCommand: string | null;
};

export type CachedSourceBase = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type CachedLocalSource = CachedSourceBase & {
  kind: "local";
  settings: CachedSourceLocalSettings;
};

export type CachedSource = CachedLocalSource;

export type CachedThreadSyncState = {
  threadId: string;
  newestTurnId: string | null;
  oldestTurnId: string | null;
  olderCursor: string | null;
  hasLoadedLatest: boolean;
  hasLoadedAllOlderTurns: boolean;
  lastSyncedAt: string | null;
};

export type CachedThreadTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

export type CachedThreadTokenUsage = {
  threadId: string;
  turnId: string;
  total: CachedThreadTokenUsageBreakdown;
  last: CachedThreadTokenUsageBreakdown;
  contextWindowTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

export type CachedThreadSnapshot = {
  thread: CachedThreadSummary;
  turns: unknown[];
  syncState: CachedThreadSyncState;
  tokenUsage: CachedThreadTokenUsage | null;
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
  sourceId?: string | null;
  searchTerm?: string | null;
};

/**
 * Describes the storage contract implemented by cache backends.
 */
export interface OpenCodexCacheRepository {
  /**
   * Ensures that a default local source exists.
   *
   * @returns Existing or newly created default source.
   */
  ensureDefaultSource(): Promise<CachedSource>;

  /**
   * Creates a new local source with default settings.
   *
   * @param name Optional display name for the source.
   * @returns Created source.
   */
  createSource(name?: string): Promise<CachedSource>;

  /**
   * Lists all configured sources.
   *
   * @returns Sources ordered for display.
   */
  listSources(): Promise<CachedSource[]>;

  /**
   * Reads a source by identifier.
   *
   * @param sourceId Source identifier.
   * @returns Source when found, otherwise `null`.
   */
  getSource(sourceId: string): Promise<CachedSource | null>;

  /**
   * Counts projects currently associated with a source.
   *
   * @param sourceId Source identifier.
   * @returns Number of linked projects.
   */
  getSourceProjectCount(sourceId: string): Promise<number>;

  /**
   * Updates editable source metadata and settings.
   *
   * @param sourceId Source identifier.
   * @param patch Partial source update.
   * @returns Updated source.
   */
  updateSource(
    sourceId: string,
    patch: Partial<Pick<CachedSource, "name">> & {
      settings?: Partial<CachedSourceLocalSettings>;
    }
  ): Promise<CachedSource>;

  /**
   * Deletes a source after clearing dependent associations.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteSource(sourceId: string): Promise<void>;

  /**
   * Removes project and thread associations for one source.
   *
   * @param sourceId Source identifier.
   * @returns Promise resolved when associations are cleared.
   */
  clearSourceAssociations(sourceId: string): Promise<void>;

  /**
   * Inserts or refreshes a cached project.
   *
   * @param projectPath Project path reported by a source.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Cached project entry.
   */
  upsertProject(projectPath: string, sourceId?: string | null): Promise<CachedProject>;

  /**
   * Updates the hidden flag for a cached project.
   *
   * @param projectId Project identifier.
   * @param isHidden Whether the project should be hidden by default.
   * @returns Promise resolved when the update completes.
   */
  setProjectHidden(projectId: string, isHidden: boolean): Promise<void>;

  /**
   * Updates project-level preferences.
   *
   * @param projectId Project identifier.
   * @param preferences Preferences to store.
   * @returns Updated cached project, or `null` when the project no longer exists.
   */
  updateProjectPreferences(
    projectId: string,
    preferences: CachedProjectPreferences
  ): Promise<CachedProject | null>;

  /**
   * Deletes a cached project.
   *
   * Existing cached threads are preserved and become orphaned.
   *
   * @param projectId Project identifier.
   * @returns Promise resolved when the project is deleted.
   */
  deleteProject(projectId: string): Promise<void>;

  /**
   * Lists cached projects.
   *
   * @returns Cached projects ordered for display.
   */
  listProjects(): Promise<CachedProject[]>;

  /**
   * Creates a persisted application log entry.
   *
   * @param input Log payload to persist.
   * @returns Created log entry.
   */
  createLog(input: CachedLogCreateInput): Promise<CachedLogEntry>;

  /**
   * Lists application logs from newest to oldest.
   *
   * @param query Log pagination query.
   * @returns Log page.
   */
  listLogs(query: CachedLogListQuery): Promise<CachedLogPage>;

  /**
   * Deletes one application log entry.
   *
   * @param logId Log identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteLog(logId: string): Promise<void>;

  /**
   * Deletes all application logs.
   *
   * @returns Promise resolved when deletion completes.
   */
  clearLogs(): Promise<void>;

  /**
   * Deletes application logs older than the provided timestamp.
   *
   * @param createdBefore Exclusive timestamp cutoff.
   * @returns Promise resolved when deletion completes.
   */
  clearLogsOlderThan(createdBefore: string): Promise<void>;

  /**
   * Lists commands configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project commands ordered for display.
   */
  listProjectCommands(projectId: string): Promise<CachedProjectCommand[]>;

  /**
   * Creates a project command.
   *
   * @param input Command configuration.
   * @returns Created command.
   */
  createProjectCommand(input: CachedProjectCommandCreateInput): Promise<CachedProjectCommand>;

  /**
   * Reads one project command.
   *
   * @param commandId Command identifier.
   * @returns Matching command.
   */
  getProjectCommand(commandId: string): Promise<CachedProjectCommand>;

  /**
   * Updates a project command.
   *
   * @param commandId Command identifier.
   * @param patch Command update.
   * @returns Updated command.
   */
  updateProjectCommand(
    commandId: string,
    patch: CachedProjectCommandUpdateInput
  ): Promise<CachedProjectCommand>;

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectCommand(commandId: string): Promise<void>;

  /**
   * Inserts or updates thread index summaries.
   *
   * @param threads Thread summaries reported by a source.
   * @returns Promise resolved when the write completes.
   */
  upsertThreadIndex(threads: CachedThreadSummary[]): Promise<void>;

  /**
   * Updates the user-defined title for a thread.
   *
   * @param threadId Thread identifier.
   * @param title Custom title.
   * @returns Promise resolved when the update completes.
   */
  updateThreadTitle(threadId: string, title: string): Promise<void>;

  /**
   * Updates the Codex-generated title for a thread.
   *
   * @param threadId Thread identifier.
   * @param title Codex title.
   * @returns Promise resolved when the update completes.
   */
  updateThreadCodexTitle(threadId: string, title: string): Promise<void>;

  /**
   * Deletes a cached thread and its cached turns.
   *
   * @param threadId Thread identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteThread(threadId: string): Promise<void>;

  /**
   * Deletes empty, never-synced cached thread shells for one project.
   *
   * @param currentProjectPath Project path to clean.
   * @param sourceId Optional source identifier.
   * @returns Number of deleted thread rows.
   */
  deleteEmptyUnsyncedThreads(
    currentProjectPath: string,
    sourceId?: string | null
  ): Promise<number>;

  /**
   * Lists cached thread summaries for a scope and optional filters.
   *
   * @param query Thread list query.
   * @returns Matching cached thread summaries.
   */
  listThreads(query: ThreadListCacheQuery): Promise<CachedThreadSummary[]>;

  /**
   * Reads a cached thread snapshot.
   *
   * @param threadId Thread identifier.
   * @param options Optional read limits.
   * @returns Cached snapshot, or `null` when the thread is unknown.
   */
  getThread(threadId: string, options?: CachedThreadReadOptions): Promise<CachedThreadSnapshot | null>;

  /**
   * Reads a page of older cached turns for a thread.
   *
   * @param query Older-turn query.
   * @returns Older turns and pagination state.
   */
  getOlderTurns(query: CachedOlderTurnsQuery): Promise<CachedOlderTurnsResult>;

  /**
   * Saves a complete thread snapshot transactionally.
   *
   * @param snapshot Thread snapshot.
   * @returns Promise resolved when the snapshot is saved.
   */
  saveThreadSnapshot(snapshot: CachedThreadSnapshot): Promise<void>;

  /**
   * Saves incremental thread turns and sync metadata.
   *
   * @param delta Thread delta.
   * @returns Promise resolved when the delta is saved.
   */
  saveThreadDelta(delta: CachedThreadDelta): Promise<void>;

  /**
   * Reads synchronization metadata for a cached thread.
   *
   * @param threadId Thread identifier.
   * @returns Sync state, or `null` when the thread is unknown.
   */
  getSyncState(threadId: string): Promise<CachedThreadSyncState | null>;

  /**
   * Persists the latest known token usage for a cached thread.
   *
   * @param usage Thread token usage snapshot.
   * @returns Promise resolved when the write completes.
   */
  saveThreadTokenUsage(usage: CachedThreadTokenUsage): Promise<void>;

  /**
   * Closes resources owned by the repository.
   *
   * @returns Promise resolved when resources are closed.
   */
  close(): Promise<void>;
}
