/**
 * Declares the cache repository contracts and persisted thread/project shapes.
 */
import type {
  OpenCodexCollaborationEvent,
  OpenCodexSubAgentSource
} from "@open-codex-ui/opencodex-protocol";

export type CachedThreadScope = "currentProject" | "all";
export type CachedSourceColor = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "teal";
export type CachedLogType = "error" | "warning" | "info";

/**
 * Serialized model metadata cached for one Codex source.
 */
export type CachedModelCatalog = {
  sourceId: string;
  modelsJson: string;
  updatedAt: string;
};

/**
 * Collaboration event persisted after semantic App Server normalization.
 */
export type CachedCollaborationEvent = OpenCodexCollaborationEvent & {
  firstObservedAt: string;
  updatedAt: string;
};

/**
 * Source-aware filters used to read persisted collaboration events.
 */
export type CachedCollaborationEventQuery = {
  sourceId: string;
  threadId?: string;
  senderThreadId?: string;
  receiverThreadId?: string;
  rootThreadId?: string;
  limit?: number;
};

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
 * Cached project row derived from a source-reported working directory.
 */
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

/**
 * OpenCodexUI-only project group.
 */
export type CachedProjectGroup = {
  id: string;
  name: string;
  color: CachedSourceColor;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Ordered project tree node persisted by OpenCodexUI.
 */
export type CachedProjectTreeItem =
  | {
      type: "group";
      groupId: string;
      parentGroupId: string | null;
      sortOrder: number;
    }
  | {
      type: "project";
      projectId: string;
      parentGroupId: string | null;
      sortOrder: number;
    };

/**
 * Complete project tree snapshot stored in the local cache.
 */
export type CachedProjectGroupsSnapshot = {
  groups: CachedProjectGroup[];
  items: CachedProjectTreeItem[];
};

/** Input used to create a project group. */
export type CachedProjectGroupCreateInput = {
  name: string;
  color?: CachedSourceColor;
  parentGroupId?: string | null;
};

/** Partial update applied to one project group. */
export type CachedProjectGroupUpdateInput = {
  name?: string;
  color?: CachedSourceColor;
  isCollapsed?: boolean;
};

/**
 * User-editable and generated preferences attached to one cached project.
 */
export type CachedProjectPreferences = {
  git?: {
    referenceTagName?: string | null;
    deferredPaths?: string[];
  };
  context?: {
    permissionsProfileId?: string | null;
    folders?: CachedProjectContextFolder[];
    lastSyncedAt?: string | null;
  };
};

/**
 * External folder that should be exposed as read-only project context.
 */
export type CachedProjectContextFolder = {
  id: string;
  path: string;
  label: string | null;
  enabled: boolean;
};

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

/**
 * Project-local command configured by the user.
 */
export type CachedProjectCommand = {
  id: string;
  projectId: string;
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input payload used to create a project command.
 */
export type CachedProjectCommandCreateInput = {
  projectId: string;
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
};

/**
 * Partial update payload for a project command.
 */
export type CachedProjectCommandUpdateInput = {
  name?: string;
  command?: string;
  allowParallel?: boolean;
  persistLogs?: boolean;
};

export type CachedCommandRuleDecision = "allow" | "prompt" | "forbidden";

/**
 * Project-local command authorization rule persisted by OpenCodexUI.
 */
export type CachedProjectCommandRule = {
  id: string;
  projectId: string;
  name: string;
  pattern: string[];
  decision: CachedCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input used to create a project command authorization rule.
 */
export type CachedProjectCommandRuleCreateInput = {
  projectId: string;
  name: string;
  pattern: string[];
  decision: CachedCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
};

/**
 * Partial update applied to a project command authorization rule.
 */
export type CachedProjectCommandRuleUpdateInput = {
  name?: string;
  pattern?: string[];
  decision?: CachedCommandRuleDecision;
  justification?: string | null;
  matchExamples?: string[];
  notMatchExamples?: string[];
  enabled?: boolean;
};

/**
 * Persisted synchronization metadata for one generated rules file.
 */
export type CachedProjectCommandRuleFileState = {
  projectId: string;
  generatedHash: string | null;
  generatedPath: string | null;
  updatedAt: string;
};

/**
 * Persisted order payload for one project's command list.
 */
export type CachedProjectCommandReorderInput = {
  projectId: string;
  commandIds: string[];
};

export type CachedProjectTaskStatus = "todo" | "inProgress" | "toValidate" | "done";

/**
 * Project-local task stored only in the OpenCodexUI cache.
 */
export type CachedProjectTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: CachedProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input payload used to create a project-local task.
 */
export type CachedProjectTaskCreateInput = {
  projectId: string;
  title: string;
  description: string;
  status: CachedProjectTaskStatus;
};

/**
 * Partial update payload for a project-local task.
 */
export type CachedProjectTaskUpdateInput = {
  title?: string;
  description?: string;
  status?: CachedProjectTaskStatus;
};

export type CachedSourceCommandMode = "auto" | "custom";
export type CachedSourceKind = "local" | "custom" | "wsl" | "ssh";

/**
 * Visual settings shared by every Codex source kind.
 */
export type CachedSourceCommonSettings = {
  color: CachedSourceColor;
};

/**
 * Host-local opener commands available only when the host can see source files.
 */
export type CachedSourceLocalAccessSettings = {
  openFolderCommand: string | null;
  openFileCommand: string | null;
};

/**
 * Settings for the automatically detected local Codex source.
 */
export type CachedSourceLocalSettings = CachedSourceCommonSettings &
  CachedSourceLocalAccessSettings & {
    commandMode: "auto";
    command: null;
  };

/**
 * Settings for an arbitrary user-provided Codex command.
 */
export type CachedSourceCustomSettings = CachedSourceCommonSettings &
  CachedSourceLocalAccessSettings & {
    commandMode: "custom";
    command: string | null;
    hasLocalAccess: boolean;
  };

/**
 * Settings for a future Windows Subsystem for Linux Codex source.
 */
export type CachedSourceWslSettings = CachedSourceCommonSettings & {
  distro: string | null;
  codexCommand: string;
};

/**
 * Settings for a future SSH-backed Codex source.
 */
export type CachedSourceSshSettings = CachedSourceCommonSettings & {
  host: string;
  user: string | null;
  port: number | null;
  identityFile: string | null;
  codexCommand: string;
};

export type CachedSourceSettings =
  | CachedSourceLocalSettings
  | CachedSourceCustomSettings
  | CachedSourceWslSettings
  | CachedSourceSshSettings;

export type CachedSourceSettingsPatch = Partial<
  CachedSourceCommonSettings &
    CachedSourceLocalAccessSettings & {
      commandMode: CachedSourceCommandMode;
      command: string | null;
      hasLocalAccess: boolean;
      distro: string | null;
      codexCommand: string;
      host: string;
      user: string | null;
      port: number | null;
      identityFile: string | null;
    }
>;

/**
 * Input used to create a source with its selected kind and settings.
 */
export type CachedSourceCreateInput = {
  kind: CachedSourceKind;
  settings?: CachedSourceSettingsPatch;
};

/**
 * Common metadata shared by all source kinds.
 */
export type CachedSourceBase = {
  id: string;
  name: string;
  lastDetectedCodexVersion: string | null;
  lastDetectedCodexAt: string | null;
  lastDetectionError: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Latest Codex CLI detection result stored for one source.
 */
export type CachedSourceCodexDetection = {
  version: string | null;
  checkedAt: string;
  error: string | null;
};

/**
 * Local source definition backed by a command on the current machine.
 */
export type CachedLocalSource = CachedSourceBase & {
  kind: "local";
  settings: CachedSourceLocalSettings;
};

export type CachedCustomSource = CachedSourceBase & {
  kind: "custom";
  settings: CachedSourceCustomSettings;
};

export type CachedWslSource = CachedSourceBase & {
  kind: "wsl";
  settings: CachedSourceWslSettings;
};

export type CachedSshSource = CachedSourceBase & {
  kind: "ssh";
  settings: CachedSourceSshSettings;
};

export type CachedSource = CachedLocalSource | CachedCustomSource | CachedWslSource | CachedSshSource;

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
 * Token usage numbers for a single usage bucket.
 */
export type CachedThreadTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

/**
 * Latest known token usage snapshot for a cached thread.
 */
export type CachedThreadTokenUsage = {
  threadId: string;
  turnId: string;
  total: CachedThreadTokenUsageBreakdown;
  last: CachedThreadTokenUsageBreakdown;
  contextWindowTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

/**
 * Immutable token usage snapshot received for one source/thread/turn.
 */
export type CachedThreadTokenUsageSnapshot = {
  id?: number;
  sourceId: string;
  threadId: string;
  turnId: string;
  observedAt: string;
  total: CachedThreadTokenUsageBreakdown;
  last: CachedThreadTokenUsageBreakdown;
  modelContextWindow: number | null;
  model: string | null;
  reasoningEffort: string | null;
  serviceTier: string | null;
};

/**
 * Query for historical token usage snapshots.
 */
export type CachedThreadTokenUsageSnapshotQuery = {
  sourceId: string;
  threadId: string;
  turnId?: string | null;
  limit?: number | null;
};

/**
 * Query for token usage snapshots across every thread of one source.
 *
 * The repository includes the latest snapshot before the period for each
 * thread so callers can calculate deltas without counting older usage again.
 */
export type CachedSourceTokenUsageSnapshotQuery = {
  sourceId: string;
  fromObservedAt: string;
  toObservedAt: string;
  limit?: number | null;
};

/**
 * Origin of a persisted Codex rate-limit snapshot.
 */
export type CachedUsageRateLimitSnapshotOrigin = "read" | "notification";

/**
 * Immutable source-scoped rate-limit snapshot.
 *
 * The payload is intentionally kept as JSON so new Codex fields can be
 * retained without requiring a cache schema change.
 */
export type CachedUsageRateLimitSnapshot = {
  id?: number;
  sourceId: string;
  observedAt: string;
  origin: CachedUsageRateLimitSnapshotOrigin;
  reason: string;
  fingerprint: string;
  payloadJson: string;
};

/**
 * Query for historical source-scoped rate-limit snapshots.
 */
export type CachedUsageRateLimitSnapshotQuery = {
  sourceId: string;
  fromObservedAt?: string | null;
  toObservedAt?: string | null;
  includeBaselineBeforeFrom?: boolean;
  limit?: number | null;
};

/**
 * Execution settings embedded temporarily in a cached raw turn.
 */
export type CachedTurnExecutionSettings = {
  requestedModel: string | null;
  effectiveModel: string | null;
  requestedReasoningEffort: string | null;
  effectiveReasoningEffort: string | null;
  serviceTier: string | null;
};

/**
 * Persisted execution metadata associated with one turn.
 */
export type CachedTurnExecutionMetadata = {
  sourceId: string;
  threadId: string;
  turnId: string;
  requestedModel: string | null;
  effectiveModel: string | null;
  requestedReasoningEffort: string | null;
  effectiveReasoningEffort: string | null;
  serviceTier: string | null;
  firstObservedAt: string;
  updatedAt: string;
};

/**
 * Aggregated token usage for the cached user-facing chats of one project.
 */
export type CachedProjectTokenUsageStatistics = {
  chatCount: number;
  chatsWithTokenUsage: number;
  chatsWithoutTokenUsage: number;
  tokenUsage: CachedThreadTokenUsageBreakdown;
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
   * Creates a source with its selected kind and settings.
   *
   * @param name Optional display name for the source.
   * @param input Source kind and settings.
   * @returns Created source.
   */
  createSource(name?: string, input?: CachedSourceCreateInput): Promise<CachedSource>;

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
      settings?: CachedSourceSettingsPatch;
    }
  ): Promise<CachedSource>;

  /**
   * Stores the latest Codex CLI detection result for a source.
   *
   * @param sourceId Source identifier.
   * @param detection Latest detection result.
   * @returns Promise resolved when the metadata is stored.
   */
  updateSourceCodexDetection(
    sourceId: string,
    detection: CachedSourceCodexDetection
  ): Promise<void>;

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
   * Reads the latest cached model catalog for one source.
   *
   * @param sourceId Source identifier.
   * @returns Cached catalog, or `null` when no catalog is stored.
   */
  getModelCatalog(sourceId: string): Promise<CachedModelCatalog | null>;

  /**
   * Stores the latest serialized model catalog for one source.
   *
   * @param sourceId Source identifier.
   * @param modelsJson Serialized model metadata.
   * @returns Promise resolved when the catalog is stored.
   */
  saveModelCatalog(sourceId: string, modelsJson: string): Promise<void>;

  /**
   * Inserts or enriches one normalized collaboration event.
   *
   * @param event Source-aware collaboration event.
   * @returns Persisted event with observation timestamps.
   */
  upsertCollaborationEvent(
    event: OpenCodexCollaborationEvent
  ): Promise<CachedCollaborationEvent>;

  /**
   * Lists normalized collaboration events matching source-aware filters.
   *
   * @param query Source, routing, and optional hierarchy filters.
   * @returns Events ordered by first observation.
   */
  listCollaborationEvents(
    query: CachedCollaborationEventQuery
  ): Promise<CachedCollaborationEvent[]>;

  /**
   * Inserts or refreshes a cached project.
   *
   * @param projectPath Project path reported by a source.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Cached project entry.
   */
  upsertProject(projectPath: string, sourceId?: string | null): Promise<CachedProject>;

  /**
   * Lists the OpenCodexUI-only project groups and ordered tree nodes.
   *
   * @returns Complete project tree snapshot.
   */
  listProjectGroups(): Promise<CachedProjectGroupsSnapshot>;

  /**
   * Creates an OpenCodexUI-only project group.
   *
   * @param input Group name and optional parent group.
   * @returns Created group.
   */
  createProjectGroup(input: CachedProjectGroupCreateInput): Promise<CachedProjectGroup>;

  /**
   * Updates an OpenCodexUI-only project group.
   *
   * @param groupId Group identifier.
   * @param patch Group fields to update.
   * @returns Updated group.
   */
  updateProjectGroup(
    groupId: string,
    patch: CachedProjectGroupUpdateInput
  ): Promise<CachedProjectGroup>;

  /**
   * Deletes a group while preserving its projects.
   *
   * @param groupId Group identifier.
   * @returns Promise resolved after children are promoted.
   */
  deleteProjectGroup(groupId: string): Promise<void>;

  /**
   * Moves a project into a group or back to the root.
   *
   * @param projectId Project identifier.
   * @param groupId Destination group, or `null` for the root.
   * @returns Promise resolved after the move.
   */
  assignProjectToGroup(projectId: string, groupId: string | null): Promise<void>;

  /**
   * Updates the hidden flag for a cached project.
   *
   * @param projectId Project identifier.
   * @param isHidden Whether the project should be hidden by default.
   * @returns Promise resolved when the update completes.
   */
  setProjectHidden(projectId: string, isHidden: boolean): Promise<void>;

  /**
   * Updates the user-defined display name for a cached project.
   *
   * @param projectId Project identifier.
   * @param displayName Display name, or `null` to fall back to the default name.
   * @returns Updated cached project, or `null` when the project no longer exists.
   */
  updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<CachedProject | null>;

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
   * Deletes empty orphan projects duplicated by an active source project.
   *
   * @returns Number of removed project rows.
   */
  deleteRedundantOrphanProjects(): Promise<number>;

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
   * Reorders commands configured for one project.
   *
   * @param input Reorder input.
   *
   * @returns Commands in their persisted order.
   */
  reorderProjectCommands(input: CachedProjectCommandReorderInput): Promise<CachedProjectCommand[]>;

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectCommand(commandId: string): Promise<void>;

  /**
   * Lists command authorization rules configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project rules ordered by creation date.
   */
  listProjectCommandRules(projectId: string): Promise<CachedProjectCommandRule[]>;

  /**
   * Creates a project command authorization rule.
   *
   * @param input Rule input.
   * @returns Created rule.
   */
  createProjectCommandRule(input: CachedProjectCommandRuleCreateInput): Promise<CachedProjectCommandRule>;

  /**
   * Reads one project command authorization rule.
   *
   * @param ruleId Rule identifier.
   * @returns Matching rule.
   */
  getProjectCommandRule(ruleId: string): Promise<CachedProjectCommandRule>;

  /**
   * Updates one project command authorization rule.
   *
   * @param ruleId Rule identifier.
   * @param patch Rule update.
   * @returns Updated rule.
   */
  updateProjectCommandRule(
    ruleId: string,
    patch: CachedProjectCommandRuleUpdateInput
  ): Promise<CachedProjectCommandRule>;

  /**
   * Deletes one project command authorization rule.
   *
   * @param ruleId Rule identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectCommandRule(ruleId: string): Promise<void>;

  /**
   * Reads generated-file synchronization metadata for one project.
   *
   * @param projectId Project identifier.
   * @returns File state, or `null` when no file was generated yet.
   */
  getProjectCommandRuleFileState(projectId: string): Promise<CachedProjectCommandRuleFileState | null>;

  /**
   * Stores generated-file synchronization metadata for one project.
   *
   * @param state New generated-file state.
   * @returns Promise resolved when the state is stored.
   */
  saveProjectCommandRuleFileState(state: CachedProjectCommandRuleFileState): Promise<void>;

  /**
   * Lists local tasks configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project tasks ordered for display.
   */
  listProjectTasks(projectId: string): Promise<CachedProjectTask[]>;

  /**
   * Creates a project task.
   *
   * @param input Task input.
   * @returns Created task.
   */
  createProjectTask(input: CachedProjectTaskCreateInput): Promise<CachedProjectTask>;

  /**
   * Updates a project task.
   *
   * @param taskId Task identifier.
   * @param patch Task update.
   * @returns Updated task.
   */
  updateProjectTask(
    taskId: string,
    patch: CachedProjectTaskUpdateInput
  ): Promise<CachedProjectTask>;

  /**
   * Deletes a project task.
   *
   * @param taskId Task identifier.
   * @returns Promise resolved when deletion completes.
   */
  deleteProjectTask(taskId: string): Promise<void>;

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
   * Updates the local archive marker for a cached thread.
   *
   * @param threadId Thread identifier.
   * @param isArchived Whether the thread is archived.
   * @returns Promise resolved when the update completes.
   */
  updateThreadArchiveState(threadId: string, isArchived: boolean): Promise<void>;

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
   * Aggregates token usage for one source-owned project.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier, or `null` for an orphan project.
   * @returns Aggregated cached token usage.
   */
  getProjectTokenUsageStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<CachedProjectTokenUsageStatistics>;

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
  saveThreadTokenUsage(usage: CachedThreadTokenUsage, sourceId?: string | null): Promise<void>;

  /**
   * Stores one immutable token usage snapshot when its values changed.
   * Repeated values for the same source, thread, and turn are ignored.
   *
   * @param snapshot Token usage snapshot.
   *
   * @returns Promise resolved when the write completes.
   */
  saveThreadTokenUsageSnapshot(snapshot: CachedThreadTokenUsageSnapshot): Promise<void>;

  /**
   * Saves the latest token usage and a distinct history snapshot atomically.
   *
   * @param usage Latest usage values for the thread.
   * @param snapshot Immutable history snapshot.
   * @returns Promise resolved when the write completes.
   */
  saveThreadTokenUsageAndSnapshot(
    usage: CachedThreadTokenUsage,
    snapshot: CachedThreadTokenUsageSnapshot
  ): Promise<void>;

  /**
   * Reads historical token usage snapshots for one thread.
   *
   * @param query Snapshot query.
   * @returns Snapshots ordered from oldest to newest.
   */
  listThreadTokenUsageSnapshots(
    query: CachedThreadTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]>;

  /**
   * Reads source-wide token usage snapshots with one baseline per thread.
   *
   * @param query Snapshot query.
   * @returns Baselines and in-range snapshots ordered from oldest to newest.
   */
  listSourceTokenUsageSnapshots(
    query: CachedSourceTokenUsageSnapshotQuery
  ): Promise<CachedThreadTokenUsageSnapshot[]>;

  /**
   * Stores one source-scoped rate-limit snapshot when its effective values changed.
   *
   * @param snapshot Rate-limit snapshot to persist.
   * @returns Promise resolved when the write completes.
   */
  saveUsageRateLimitSnapshot(snapshot: CachedUsageRateLimitSnapshot): Promise<void>;

  /**
   * Reads historical source-scoped rate-limit snapshots.
   *
   * @param query Snapshot query.
   * @returns Snapshots ordered from oldest to newest.
   */
  listUsageRateLimitSnapshots(
    query: CachedUsageRateLimitSnapshotQuery
  ): Promise<CachedUsageRateLimitSnapshot[]>;

  /**
   * Upserts execution metadata for one turn.
   *
   * @param metadata Turn execution metadata.
   * @returns Promise resolved when the write completes.
   */
  saveTurnExecutionMetadata(metadata: CachedTurnExecutionMetadata): Promise<void>;

  /**
   * Closes resources owned by the repository.
   *
   * @returns Promise resolved when resources are closed.
   */
  close(): Promise<void>;
}
