import type {
  OpenCodexApprovalDecision,
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCommitMessageLanguage,
  OpenCodexCommitPrompt,
  OpenCodexDockerContainerLogs,
  OpenCodexDockerHostSnapshot,
  OpenCodexDockerComposeLogs,
  OpenCodexDockerComposeSnapshot,
  OpenCodexComposerReference,
  OpenCodexCodexReleaseCheck,
  OpenCodexFileSearchResult,
  OpenCodexGitBranch,
  OpenCodexGitBranchKind,
  OpenCodexGitCommitDetails,
  OpenCodexGitCommitResult,
  OpenCodexGitLogPage,
  OpenCodexGitRemote,
  OpenCodexGitStatus,
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult,
  OpenCodexImageAttachment,
  OpenCodexInstalledPluginListResult,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit,
  OpenCodexModel,
  OpenCodexPluginDetail,
  OpenCodexPluginCatalogRefreshResult,
  OpenCodexPluginInstallResult,
  OpenCodexPluginListResult,
  OpenCodexPluginSearchResult,
  OpenCodexProject,
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRule,
  OpenCodexProjectCommandRuleApplyResult,
  OpenCodexProjectCommandRuleTestResult,
  OpenCodexProjectCommandRulesSnapshot,
  OpenCodexProjectCommandRun,
  OpenCodexProjectGroupsSnapshot,
  OpenCodexProjectPreferences,
  OpenCodexProjectStatistics,
  OpenCodexProjectTask,
  OpenCodexProjectTaskStatus,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexSkillSearchResult,
  OpenCodexSource,
  OpenCodexSourceColor,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch,
  OpenCodexThread,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadGoal,
  OpenCodexThreadGoalPatch,
  OpenCodexThreadRuntimeStatus,
  OpenCodexToolVersionStatus,
  OpenCodexTurn,
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryAggregation,
  OpenCodexUsageResetConsumeResult,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

/** Public operations for cached projects. */
export interface ProjectsApi {
  list(): Promise<OpenCodexProject[]>;
  setHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }>;
  setDisplayName(projectId: string, displayName: string | null): Promise<OpenCodexProject>;
  updatePreferences(
    projectId: string,
    patch: Partial<OpenCodexProjectPreferences>
  ): Promise<OpenCodexProject>;
  delete(projectId: string): Promise<{ ok: true }>;
  open(projectPath: string, sourceId: string | null, createIfMissing: boolean): Promise<OpenCodexProject>;
  pickDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null>;
  readStatistics(projectPath: string, sourceId: string | null): Promise<OpenCodexProjectStatistics>;
}

/** Public operations for configured Codex sources. */
export interface SourcesApi {
  list(): Promise<OpenCodexSource[]>;
  create(
    name: string,
    kind: OpenCodexSourceKind,
    settings: OpenCodexSourceSettingsPatch
  ): Promise<OpenCodexSource>;
  sync(sourceId: string | null): Promise<OpenCodexProject[]>;
  delete(sourceId: string): Promise<{ ok: true }>;
  update(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): Promise<OpenCodexSource>;
}

/** Public operations for the project group tree. */
export interface GroupsApi {
  list(): Promise<OpenCodexProjectGroupsSnapshot>;
  create(
    name: string,
    parentGroupId?: string | null,
    color?: OpenCodexSourceColor
  ): Promise<OpenCodexProjectGroupsSnapshot>;
  update(
    groupId: string,
    patch: { name?: string; color?: OpenCodexSourceColor; isCollapsed?: boolean }
  ): Promise<OpenCodexProjectGroupsSnapshot>;
  delete(groupId: string): Promise<OpenCodexProjectGroupsSnapshot>;
  assignProject(projectId: string, groupId: string | null): Promise<OpenCodexProjectGroupsSnapshot>;
}

/** Public operations for synchronizing external project context folders. */
export interface ProjectContextApi {
  sync(projectId: string): Promise<OpenCodexProject>;
  pickFolder(): Promise<string | null>;
}

/** Public operations for local project tasks. */
export interface ProjectTasksApi {
  list(projectId: string): Promise<OpenCodexProjectTask[]>;
  create(
    projectId: string,
    title: string,
    description: string,
    status: OpenCodexProjectTaskStatus
  ): Promise<OpenCodexProjectTask>;
  update(
    taskId: string,
    patch: { title?: string; description?: string; status?: OpenCodexProjectTaskStatus }
  ): Promise<OpenCodexProjectTask>;
  delete(taskId: string): Promise<{ ok: true }>;
}

/** Public operations for project trust decisions. */
export interface ProjectTrustApi {
  grant(projectPath: string): Promise<{ ok: true }>;
  dismiss(projectPath: string): void;
}

/** Public operations for Codex release checks and source updates. */
export interface CodexUpdatesApi {
  checkRelease(force: boolean): Promise<OpenCodexCodexReleaseCheck>;
  applyToSource(sourceId: string): Promise<OpenCodexSource[]>;
}

/** Public thread and turn operations. */
export interface ThreadsApi {
  list(
    scope: "currentProject" | "all",
    projectPath: string | null,
    sourceId: string | null,
    searchTerm?: string,
    isArchived?: boolean
  ): Promise<OpenCodexThread[]>;
  archive(threadId: string): Promise<{ ok: true }>;
  delete(threadId: string): Promise<{ ok: true }>;
  restore(threadId: string): Promise<{ ok: true }>;
  open(
    threadId: string,
    sourceId?: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }>;
  readGoal(
    threadId: string,
    sourceId?: string | null
  ): Promise<OpenCodexThreadGoal | null>;
  setGoal(
    threadId: string,
    sourceId: string | null,
    patch: OpenCodexThreadGoalPatch
  ): Promise<OpenCodexThreadGoal>;
  clearGoal(
    threadId: string,
    sourceId?: string | null
  ): Promise<{ cleared: boolean }>;
  listSubAgents(parentThreadId: string, sourceId: string | null): Promise<OpenCodexThread[]>;
  readReadonly(
    threadId: string,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }>;
  loadOlderMessages(
    threadId: string
  ): Promise<{ turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }>;
  recover(threadId: string): Promise<{ ok: true }>;
  create(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }>;
  updateComposerSettings(
    threadId: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<void>;
  startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string; turnId: string }>;
  steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }>;
  editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null
  ): Promise<{ threadId: string }>;
  interruptTurn(threadId: string, turnId: string): Promise<void>;
  readRuntimeStatus(threadId: string): Promise<OpenCodexThreadRuntimeStatus>;
  startReview(threadId: string, projectPath: string | null): Promise<{ ok: true }>;
  compact(threadId: string, projectPath: string | null): Promise<{ ok: true }>;
  rename(threadId: string, name: string): Promise<void>;
}

/** Public collaboration-event queries. */
export interface CollaborationApi {
  list(query: OpenCodexCollaborationQuery): Promise<OpenCodexCollaborationEvent[]>;
}

/** Public bounded thread event-log queries. */
export interface EventLogApi {
  read(threadId: string, sourceId: string | null, limit: number): OpenCodexThreadEventLogPage;
}

/** Public operations for project command definitions and command runs. */
export interface CommandsApi {
  list(projectId: string): Promise<OpenCodexProjectCommand[]>;
  create(
    projectId: string,
    name: string,
    command: string,
    allowParallel: boolean,
    persistLogs: boolean
  ): Promise<OpenCodexProjectCommand>;
  update(
    commandId: string,
    patch: { name?: string; command?: string; allowParallel?: boolean; persistLogs?: boolean }
  ): Promise<OpenCodexProjectCommand>;
  reorder(projectId: string, commandIds: string[]): Promise<OpenCodexProjectCommand[]>;
  delete(commandId: string): Promise<{ ok: true }>;
  run(commandId: string, projectPath: string, sourceId: string | null): Promise<OpenCodexProjectCommandRun>;
  stop(runId: string): Promise<{ ok: true }>;
}

/** Public fields required to create a managed project command rule. */
export type ProjectCommandRuleCreateInput = Pick<
  OpenCodexProjectCommandRule,
  | "projectId"
  | "name"
  | "pattern"
  | "decision"
  | "justification"
  | "matchExamples"
  | "notMatchExamples"
  | "enabled"
>;

/** Public fields accepted when updating a managed project command rule. */
export type ProjectCommandRuleUpdateInput = Partial<
  Pick<
    OpenCodexProjectCommandRule,
    | "name"
    | "pattern"
    | "decision"
    | "justification"
    | "matchExamples"
    | "notMatchExamples"
    | "enabled"
  >
>;

/** Public operations for managed project command rules. */
export interface RulesApi {
  read(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot>;
  create(input: ProjectCommandRuleCreateInput): Promise<OpenCodexProjectCommandRule>;
  update(
    ruleId: string,
    patch: ProjectCommandRuleUpdateInput
  ): Promise<OpenCodexProjectCommandRule>;
  delete(ruleId: string): Promise<{ ok: true }>;
  apply(projectId: string, force?: boolean): Promise<OpenCodexProjectCommandRuleApplyResult>;
  test(projectId: string, command: string): Promise<OpenCodexProjectCommandRuleTestResult>;
  restart(projectId: string): Promise<OpenCodexProjectCommandRulesSnapshot>;
}

/** Public project command and rule APIs. */
export interface AutomationApi {
  readonly commands: CommandsApi;
  readonly rules: RulesApi;
}

/** Public commit-message operations nested below the Git API. */
export interface CommitMessageApi {
  readPrompt(): Promise<OpenCodexCommitPrompt>;
  updatePrompt(prompt: string): Promise<OpenCodexCommitPrompt>;
  resetPrompt(): Promise<OpenCodexCommitPrompt>;
  generate(
    projectPath: string,
    sourceId: string | null,
    instruction: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    language: OpenCodexCommitMessageLanguage
  ): Promise<OpenCodexCommitMessageGenerationResult>;
}

/** Public source-scoped Git operations. */
export interface GitApi {
  readonly commitMessage: CommitMessageApi;
  readVersion(): Promise<OpenCodexToolVersionStatus>;
  readStatus(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus>;
  initializeRepository(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus>;
  listRemotes(projectPath: string, sourceId: string | null): Promise<OpenCodexGitRemote[]>;
  upsertRemote(
    projectPath: string,
    sourceId: string | null,
    name: string,
    url: string
  ): Promise<OpenCodexGitStatus>;
  listBranches(projectPath: string, sourceId: string | null): Promise<OpenCodexGitBranch[]>;
  listTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagListResult>;
  fetchTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagFetchResult>;
  createTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string
  ): Promise<OpenCodexGitTagListResult>;
  pushTag(
    projectPath: string,
    sourceId: string | null,
    tagName: string,
    force: boolean
  ): Promise<OpenCodexGitTagListResult>;
  pushTags(projectPath: string, sourceId: string | null): Promise<OpenCodexGitTagListResult>;
  countCommitsSinceTag(projectPath: string, sourceId: string | null, tagName: string): Promise<number>;
  readLog(projectPath: string, sourceId: string | null, limit: number, skip: number): Promise<OpenCodexGitLogPage>;
  readCommitDetails(
    projectPath: string,
    sourceId: string | null,
    hash: string
  ): Promise<OpenCodexGitCommitDetails>;
  checkoutBranch(
    projectPath: string,
    sourceId: string | null,
    branchName: string,
    branchKind: OpenCodexGitBranchKind
  ): Promise<OpenCodexGitStatus>;
  createBranch(projectPath: string, sourceId: string | null, branchName: string): Promise<OpenCodexGitStatus>;
  mergeBranch(projectPath: string, sourceId: string | null, branchName: string): Promise<OpenCodexGitStatus>;
  stage(projectPath: string, sourceId: string | null, paths: string[]): Promise<OpenCodexGitStatus>;
  unstage(projectPath: string, sourceId: string | null, paths: string[]): Promise<OpenCodexGitStatus>;
  commit(projectPath: string, sourceId: string | null, message: string): Promise<OpenCodexGitCommitResult>;
  push(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus>;
  publishCurrentBranch(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus>;
  pull(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus>;
}

/** Public operations for existing containers in the desktop host Docker context. */
export interface DockerApi {
  readSnapshot(): Promise<OpenCodexDockerHostSnapshot>;
  start(containerId: string): Promise<{ ok: true }>;
  stop(containerId: string): Promise<{ ok: true }>;
  restart(containerId: string): Promise<{ ok: true }>;
  readLogs(containerId: string, tail?: number): Promise<OpenCodexDockerContainerLogs>;
}

/** Public source-scoped Docker Compose operations for a project. */
export interface DockerComposeApi {
  readSnapshot(projectPath: string, sourceId: string): Promise<OpenCodexDockerComposeSnapshot>;
  up(projectPath: string, sourceId: string, serviceName: string): Promise<{ ok: true }>;
  stop(projectPath: string, sourceId: string, serviceName: string): Promise<{ ok: true }>;
  restart(projectPath: string, sourceId: string, serviceName: string): Promise<{ ok: true }>;
  readLogs(
    projectPath: string,
    sourceId: string,
    serviceName: string,
    tail?: number
  ): Promise<OpenCodexDockerComposeLogs>;
}

/** Public persisted application-log operations. */
export interface LogsApi {
  list(beforeCreatedAt: string | null, limit: number): Promise<OpenCodexLogPage>;
  delete(logId: string): Promise<{ ok: true }>;
  clear(mode: "all" | "olderThan", amount: number, unit: OpenCodexLogRetentionUnit): Promise<{ ok: true }>;
  create(type: OpenCodexLogEntry["type"], message: string, details: unknown): Promise<{ ok: true }>;
}

/** Reasons exposed by the public usage-limit read operation. */
export type UsageReadReason = "bootstrap" | "request" | "turnCompleted" | "resetConsume";

/** Public source-scoped usage operations. */
export interface UsageApi {
  readLimits(sourceId?: string | null, reason?: UsageReadReason): Promise<OpenCodexUsageSnapshot | null>;
  readHistory(
    sourceId: string,
    from: string,
    to: string,
    aggregation?: OpenCodexUsageHistoryAggregation
  ): Promise<OpenCodexUsageHistory>;
  consumeReset(
    sourceId: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<OpenCodexUsageResetConsumeResult>;
}

/** Public model-catalog operations. */
export interface ModelsApi {
  list(): Promise<OpenCodexModel[]>;
}

/** Public plugin identity accepted by plugin operations. */
export type PluginTarget = {
  sourceId: string | null;
  marketplaceName: string;
  marketplacePath: string | null;
  pluginName: string;
};

/** Public plugin marketplace operations. */
export interface PluginsApi {
  list(sourceId: string | null): Promise<OpenCodexPluginListResult>;
  installed(sourceId: string | null): Promise<OpenCodexInstalledPluginListResult>;
  search(
    sourceId: string | null,
    searchTerm: string,
    cursor?: string | null,
    limit?: number
  ): Promise<OpenCodexPluginSearchResult>;
  refresh(sourceId: string | null): Promise<OpenCodexPluginCatalogRefreshResult>;
  read(target: PluginTarget): Promise<OpenCodexPluginDetail>;
  install(target: PluginTarget): Promise<OpenCodexPluginInstallResult>;
  uninstall(sourceId: string | null, pluginId: string): Promise<{ ok: true }>;
}

/** Public project file and skill search operations. */
export interface SearchApi {
  files(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexFileSearchResult[]>;
  skills(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexSkillSearchResult[]>;
}

/** Public host filesystem, picker, link, and process operations. */
export interface HostApi {
  pickExecutable(): Promise<string | null>;
  pickImages(): Promise<OpenCodexImageAttachment[]>;
  openLink(href: string, projectPath: string | null, sourceId: string | null): Promise<{ ok: true }>;
  openInIde(projectPath: string, sourceId: string | null): Promise<{ ok: true }>;
  openFolder(projectPath: string, sourceId: string | null): Promise<{ ok: true }>;
  openTerminal(projectPath: string, sourceId: string | null): Promise<{ ok: true }>;
}

/** Public approval-resolution operations. */
export interface ApprovalsApi {
  resolve(approvalId: string, decision: OpenCodexApprovalDecision): void;
}

/** Public settings reads and updates. */
export interface SettingsApi {
  get(): OpenCodexSettings;
  update(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings>;
}
