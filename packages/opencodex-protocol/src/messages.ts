/**
 * Declares the shared protocol types exchanged between the UI, backend, and transport layers.
 */
/**
 * Reasoning effort values accepted by Codex and displayed in composer controls.
 */
export type OpenCodexReasoningEffort = string;

/**
 * Reasoning effort option advertised by one Codex model.
 */
export type OpenCodexReasoningEffortOption = {
  reasoningEffort: OpenCodexReasoningEffort;
  description: string;
};

/**
 * Conservative reasoning levels used when Codex cannot provide model metadata.
 */
export const DEFAULT_OPEN_CODEX_REASONING_EFFORTS: OpenCodexReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh"
];

/**
 * Assistant message phase emitted by Codex for reasoning-like and final content.
 */
export type OpenCodexMessagePhase = "commentary" | "final_answer";

/**
 * Color scheme preference stored in app settings.
 */
export type OpenCodexColorScheme = "light" | "dark" | "system";

/**
 * Composer behavior for a plain Enter key press.
 */
export type OpenCodexEnterKeyBehavior = "newline" | "send" | "smart";

/**
 * Output language used for generated commit messages.
 */
export type OpenCodexCommitMessageLanguage = "en" | "fr";

/**
 * Vocabulary level used by Git UI labels.
 */
export type OpenCodexVersioningVocabulary = "simple" | "technical";

/**
 * Log entry severity persisted by OpenCodexUI.
 */
export type OpenCodexLogType = "error" | "warning" | "info";

/**
 * Retention unit available when clearing old logs.
 */
export type OpenCodexLogRetentionUnit = "hours" | "days" | "weeks" | "months";

/**
 * Codex exec-policy amendment accepted by permission approvals.
 */
export type OpenCodexExecPolicyAmendment = string[];

/**
 * Codex network-policy amendment accepted by permission approvals.
 */
export type OpenCodexNetworkPolicyAmendment = {
  host: string;
  action: "allow" | "deny";
};

/**
 * UI approval decisions and structured policy amendments sent back to Codex.
 */
export type OpenCodexApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: OpenCodexExecPolicyAmendment;
      };
    }
  | {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: OpenCodexNetworkPolicyAmendment;
      };
    };

/**
 * Thread list scopes supported by the backend.
 */
export type OpenCodexThreadScope = "currentProject" | "all";

/**
 * UI language preference.
 */
export type OpenCodexLanguage = "system" | "fr" | "en";

/**
 * Source kind supported by the current app version.
 */
export type OpenCodexSourceKind = "local" | "custom" | "wsl" | "ssh";

/**
 * Source command resolution mode.
 */
export type OpenCodexSourceCommandMode = "auto" | "custom";

/**
 * Source accent color used in source/project UI.
 */
export type OpenCodexSourceColor = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "teal";

/**
 * Availability state for host tools such as Git and Codex CLI.
 */
export type OpenCodexToolAvailabilityStatus = "ready" | "outdated" | "unavailable";

/**
 * Codex service-tier identifier selected for a turn.
 */
export type OpenCodexServiceTier = string;

/**
 * One service tier supported by a Codex model.
 */
export type OpenCodexModelServiceTier = {
  id: OpenCodexServiceTier;
  name: string;
  description: string;
};

/**
 * Model metadata returned by Codex or local fallback detection.
 */
export type OpenCodexModel = {
  id: string;
  model: string;
  displayName: string;
  supportedReasoningEfforts: OpenCodexReasoningEffortOption[];
  defaultReasoningEffort: OpenCodexReasoningEffort | null;
  serviceTiers: OpenCodexModelServiceTier[];
};

/**
 * Detected version and availability for a command-line tool.
 */
export type OpenCodexToolVersionStatus = {
  status: OpenCodexToolAvailabilityStatus;
  version: string | null;
  message: string | null;
  checkedAt: string;
};

/**
 * Last global Codex release metadata check persisted in app settings.
 */
export type OpenCodexCodexReleaseCheck = {
  latestVersion: string | null;
  checkedAt: string | null;
  error: string | null;
};

/**
 * Per-source update status derived from local detection and global release metadata.
 */
export type OpenCodexCodexUpdateStatus = {
  supported: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  checkedAt: string | null;
  message: string | null;
};

/**
 * Candidate Codex command discovered for source configuration.
 */
export type OpenCodexCommandCandidate = {
  command: string;
  codex: OpenCodexToolVersionStatus;
};

/**
 * Visual settings shared by every Codex source kind.
 */
export type OpenCodexSourceCommonSettings = {
  color: OpenCodexSourceColor;
};

/**
 * Host-local opener commands available when source files are visible locally.
 */
export type OpenCodexSourceLocalAccessSettings = {
  openFolderCommand: string | null;
  openFileCommand: string | null;
};

/**
 * Local-source specific settings.
 */
export type OpenCodexSourceLocalSettings = OpenCodexSourceCommonSettings &
  OpenCodexSourceLocalAccessSettings & {
    commandMode: "auto";
    command: null;
  };

/**
 * Custom command source settings.
 */
export type OpenCodexSourceCustomSettings = OpenCodexSourceCommonSettings &
  OpenCodexSourceLocalAccessSettings & {
    commandMode: "custom";
    command: string | null;
    hasLocalAccess: boolean;
  };

/**
 * WSL source settings.
 */
export type OpenCodexSourceWslSettings = OpenCodexSourceCommonSettings & {
  distro: string | null;
  codexCommand: string;
};

/**
 * SSH source settings.
 */
export type OpenCodexSourceSshSettings = OpenCodexSourceCommonSettings & {
  host: string;
  user: string | null;
  port: number | null;
  identityFile: string | null;
  codexCommand: string;
};

export type OpenCodexSourceSettings =
  | OpenCodexSourceLocalSettings
  | OpenCodexSourceCustomSettings
  | OpenCodexSourceWslSettings
  | OpenCodexSourceSshSettings;

export type OpenCodexSourceSettingsPatch = Partial<
  OpenCodexSourceCommonSettings &
    OpenCodexSourceLocalAccessSettings & {
      commandMode: OpenCodexSourceCommandMode;
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
 * Common metadata shared by every source kind.
 */
export type OpenCodexSourceBase = {
  id: string;
  kind: OpenCodexSourceKind;
  name: string;
  associatedProjectCount: number;
  codex: OpenCodexToolVersionStatus;
  codexUpdate: OpenCodexCodexUpdateStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Local Codex source running on the Electron host or a configured command.
 */
export type OpenCodexLocalSource = OpenCodexSourceBase & {
  kind: "local";
  settings: OpenCodexSourceLocalSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * Custom command source.
 */
export type OpenCodexCustomSource = OpenCodexSourceBase & {
  kind: "custom";
  settings: OpenCodexSourceCustomSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * WSL source running through a Windows host bridge.
 */
export type OpenCodexWslSource = OpenCodexSourceBase & {
  kind: "wsl";
  settings: OpenCodexSourceWslSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * SSH source running Codex app-server on a remote machine.
 */
export type OpenCodexSshSource = OpenCodexSourceBase & {
  kind: "ssh";
  settings: OpenCodexSourceSshSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

/**
 * Discriminated source union exposed to the UI.
 */
export type OpenCodexSource = OpenCodexLocalSource | OpenCodexCustomSource | OpenCodexWslSource | OpenCodexSshSource;

/**
 * Cached project known by OpenCodexUI.
 */
export type OpenCodexProject = {
  id: string;
  sourceId: string | null;
  path: string;
  defaultName: string;
  displayName: string | null;
  isHidden: boolean;
  preferences: OpenCodexProjectPreferences;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
};

/**
 * Decision written to a Codex command authorization rule.
 */
export type OpenCodexCommandRuleDecision = "allow" | "prompt" | "forbidden";

/**
 * Project-local command rule managed by OpenCodexUI.
 */
export type OpenCodexProjectCommandRule = {
  id: string;
  projectId: string;
  name: string;
  pattern: string[];
  decision: OpenCodexCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * State of the generated project-local rules file.
 */
export type OpenCodexProjectCommandRuleFileStatus =
  | "unsupported"
  | "notGenerated"
  | "synchronized"
  | "pending"
  | "external";

/**
 * Runtime state relevant to project rule changes.
 */
export type OpenCodexProjectCommandRuleRuntimeState =
  | "ready"
  | "restartPending"
  | "restarting"
  | "error";

/**
 * Synchronization and runtime status for one project's managed rules file.
 */
export type OpenCodexProjectCommandRuleStatus = {
  projectId: string;
  sourceId: string | null;
  filePath: string | null;
  fileStatus: OpenCodexProjectCommandRuleFileStatus;
  generatedHash: string | null;
  currentHash: string | null;
  desiredHash: string | null;
  isSupported: boolean;
  runtimeState: OpenCodexProjectCommandRuleRuntimeState;
  runtimeMessage: string | null;
};

/**
 * Complete project rule state returned to the UI.
 */
export type OpenCodexProjectCommandRulesSnapshot = {
  rules: OpenCodexProjectCommandRule[];
  status: OpenCodexProjectCommandRuleStatus;
};

/**
 * One rule match returned by `codex execpolicy check`.
 */
export type OpenCodexProjectCommandRuleMatch = {
  matchedPrefix: string[];
  decision: OpenCodexCommandRuleDecision;
  justification: string | null;
};

/**
 * Result of testing a command against the generated project rules file.
 */
export type OpenCodexProjectCommandRuleTestResult = {
  command: string[];
  decision: OpenCodexCommandRuleDecision | null;
  matchedRules: OpenCodexProjectCommandRuleMatch[];
  stdout: string;
  stderr: string;
  exitCode: number;
  parseError: string | null;
};

/**
 * Result of applying the generated project rules file.
 */
export type OpenCodexProjectCommandRuleApplyResult = {
  applied: boolean;
  requiresConfirmation: boolean;
  snapshot: OpenCodexProjectCommandRulesSnapshot;
};

/**
 * User-editable project preferences stored in SQLite.
 */
export type OpenCodexProjectPreferences = {
  git?: {
    referenceTagName?: string | null;
    /** Relative paths temporarily excluded from OpenCodexUI staging actions. */
    deferredPaths?: string[];
  };
  context?: {
    permissionsProfileId?: string | null;
    folders?: OpenCodexProjectContextFolder[];
    lastSyncedAt?: string | null;
  };
};

/**
 * External context folder configured for one project.
 */
export type OpenCodexProjectContextFolder = {
  id: string;
  path: string;
  label: string | null;
  enabled: boolean;
};

/**
 * File or directory search result for composer references.
 */
export type OpenCodexFileSearchResult = {
  root: string;
  path: string;
  relativePath: string;
  fileName: string;
  matchType: "file" | "directory";
};

/**
 * Skill search result for composer references.
 */
export type OpenCodexSkillSearchResult = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  path: string;
  scope: string;
};

/**
 * Structured composer reference embedded in a turn request.
 */
export type OpenCodexComposerReference =
  | {
      type: "skill";
      name: string;
      path: string;
    };

/**
 * Persisted application log entry.
 */
export type OpenCodexLogEntry = {
  id: string;
  type: OpenCodexLogType;
  message: string;
  details: unknown;
  createdAt: string;
};

/**
 * Processing stage recorded by the per-chat Codex event trace.
 */
export type OpenCodexThreadEventLogStage = "received" | "ui-emitted";

/**
 * Scalar metadata value retained by the per-chat Codex event trace.
 */
export type OpenCodexThreadEventLogValue = string | number | boolean | null;

/**
 * Metadata-only event entry associated with one source and chat thread.
 */
export type OpenCodexThreadEventLogEntry = {
  id: string;
  sequence: number;
  stage: OpenCodexThreadEventLogStage;
  eventName: string;
  sourceId: string | null;
  threadId: string;
  turnId: string | null;
  itemId: string | null;
  occurredAt: string;
  lastOccurredAt: string;
  count: number;
  details: Record<string, OpenCodexThreadEventLogValue>;
};

/**
 * Bounded result returned when reading a per-chat Codex event trace.
 */
export type OpenCodexThreadEventLogPage = {
  entries: OpenCodexThreadEventLogEntry[];
  truncated: boolean;
};

/**
 * Paginated log result.
 */
export type OpenCodexLogPage = {
  logs: OpenCodexLogEntry[];
  hasMore: boolean;
};

/**
 * Normalized Git file status.
 */
export type OpenCodexGitFileState =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "unknown";

/**
 * Git status entry for one changed file.
 */
export type OpenCodexGitFile = {
  path: string;
  originalPath: string | null;
  status: OpenCodexGitFileState;
  stagedStatus: OpenCodexGitFileState | null;
  unstagedStatus: OpenCodexGitFileState | null;
};

/**
 * Git remote endpoints grouped by remote name.
 */
export type OpenCodexGitRemote = {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
};

/**
 * Current Git repository status for a project.
 */
export type OpenCodexGitStatus = {
  isRepository: boolean;
  aheadCount: number;
  behindCount: number;
  branchName: string | null;
  upstreamName: string | null;
  pendingCommitMessage: string | null;
  remotes: OpenCodexGitRemote[];
  changedFiles: OpenCodexGitFile[];
  stagedFiles: OpenCodexGitFile[];
};

/**
 * Git branch source kind.
 */
export type OpenCodexGitBranchKind = "local" | "remote";

/**
 * Git branch displayed by branch switcher and merge UI.
 */
export type OpenCodexGitBranch = {
  name: string;
  fullName: string;
  kind: OpenCodexGitBranchKind;
  upstreamName: string | null;
  isCurrent: boolean;
};

/**
 * Synchronization state for a local Git tag and its configured remote.
 */
export type OpenCodexGitTagSyncStatus = "synced" | "local-only" | "diverged" | "unknown";

/**
 * Lightweight Git tag metadata and remote synchronization state.
 */
export type OpenCodexGitTag = {
  name: string;
  fullName: string;
  targetHash: string | null;
  createdAt: string | null;
  remoteTargetHash: string | null;
  syncStatus: OpenCodexGitTagSyncStatus;
};

/**
 * Git tag listing with the remote used for synchronization checks.
 */
export type OpenCodexGitTagListResult = {
  tags: OpenCodexGitTag[];
  remoteName: string | null;
  remoteError: string | null;
};

/**
 * Tag listing result with optional fetch warning.
 */
export type OpenCodexGitTagFetchResult = OpenCodexGitTagListResult & {
  warning: string | null;
};

/**
 * Compact Git commit metadata shown in the log modal.
 */
export type OpenCodexGitLogCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string | null;
  subject: string;
  refs: string[];
};

/**
 * Paginated Git log result.
 */
export type OpenCodexGitLogPage = {
  commits: OpenCodexGitLogCommit[];
  hasMore: boolean;
};

/**
 * File-level change included in one Git commit.
 */
export type OpenCodexGitCommitFileChange = {
  status: OpenCodexGitFileState;
  path: string;
  originalPath: string | null;
};

/**
 * Full Git commit details loaded on demand.
 */
export type OpenCodexGitCommitDetails = {
  hash: string;
  message: string;
  files: OpenCodexGitCommitFileChange[];
};

/**
 * Successful Git commit response.
 */
export type OpenCodexGitCommitResult = {
  ok: true;
  output: string;
};

/**
 * One quota window reported by Codex account usage.
 */
export type OpenCodexUsageWindow = {
  label: "5h" | "weekly" | "usage";
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: string | null;
};

/**
 * Optional credit metadata returned with account usage.
 */
export type OpenCodexUsageCredits = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

/**
 * Status of one banked rate-limit reset credit.
 */
export type OpenCodexUsageResetCreditStatus =
  | "available"
  | "redeeming"
  | "redeemed"
  | "unknown";

/**
 * One banked rate-limit reset credit returned by Codex.
 */
export type OpenCodexUsageResetCredit = {
  id: string;
  resetType: string;
  status: OpenCodexUsageResetCreditStatus;
  grantedAt: string | null;
  expiresAt: string | null;
  title: string | null;
  description: string | null;
};

/**
 * Summary of banked rate-limit resets for one Codex account.
 */
export type OpenCodexUsageResetCredits = {
  availableCount: number;
  credits: OpenCodexUsageResetCredit[] | null;
};

/**
 * Result returned after attempting to consume one banked reset credit.
 */
export type OpenCodexUsageResetConsumeResult = {
  outcome: "reset" | "nothingToReset" | "noCredit" | "alreadyRedeemed";
};

/**
 * Usage limits for one Codex account limit id.
 */
export type OpenCodexUsageLimits = {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: OpenCodexUsageWindow | null;
  secondary: OpenCodexUsageWindow | null;
  credits: OpenCodexUsageCredits | null;
};

/**
 * Usage snapshot emitted to the UI.
 */
export type OpenCodexUsageSnapshot = {
  sourceId: string;
  limits: OpenCodexUsageLimits[];
  /** Omitted by sparse rate-limit notifications, which do not contain reset data. */
  rateLimitResetCredits?: OpenCodexUsageResetCredits | null;
  updatedAt: string;
};

/**
 * Token counts grouped by category.
 */
export type OpenCodexThreadTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

/**
 * Context-window usage for one thread/turn.
 */
export type OpenCodexThreadTokenUsage = {
  threadId: string;
  turnId: string;
  total: OpenCodexThreadTokenUsageBreakdown;
  last: OpenCodexThreadTokenUsageBreakdown;
  contextWindowTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

/**
 * Aggregated statistics for the user-facing chats of one project.
 */
export type OpenCodexProjectStatistics = {
  chatCount: number;
  chatsWithTokenUsage: number;
  chatsWithoutTokenUsage: number;
  tokenUsage: OpenCodexThreadTokenUsageBreakdown;
};

/**
 * Editable commit-generation prompt state.
 */
export type OpenCodexCommitPrompt = {
  prompt: string;
  defaultPrompt: string;
  isDefault: boolean;
};

/**
 * Generated commit message returned by the backend.
 */
export type OpenCodexCommitMessageGenerationResult = {
  message: string;
};

/**
 * User-configured project command definition.
 */
export type OpenCodexProjectCommand = {
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
 * Lifecycle status for one project command run.
 */
export type OpenCodexProjectCommandRunStatus = "running" | "exited" | "failed" | "killed";

/**
 * Process output stream name for project command logs.
 */
export type OpenCodexProjectCommandOutputStream = "stdout" | "stderr";

/**
 * Live or completed execution of one project command.
 */
export type OpenCodexProjectCommandRun = {
  id: string;
  projectId: string;
  commandId: string;
  processHandle: string;
  command: string;
  status: OpenCodexProjectCommandRunStatus;
  startedAt: string;
  exitedAt: string | null;
  exitCode: number | null;
  logPath: string | null;
};

/**
 * Workflow status for local project tasks.
 */
export type OpenCodexProjectTaskStatus = "todo" | "inProgress" | "toValidate" | "done";

/**
 * Local task stored for one project.
 */
export type OpenCodexProjectTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: OpenCodexProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Plugin installation policy reported by Codex.
 */
export type OpenCodexPluginInstallPolicy =
  | "available"
  | "notAvailable"
  | "installedByDefault"
  | "unknown";

/**
 * Plugin availability reported by Codex.
 */
export type OpenCodexPluginAvailability = "available" | "disabledByAdmin" | "unknown";

/**
 * Plugin source kind reported by Codex.
 */
export type OpenCodexPluginSourceType = "local" | "git" | "remote" | "unknown";

/**
 * Plugin marketplace containing installable plugin summaries.
 */
export type OpenCodexPluginMarketplace = {
  name: string;
  displayName: string;
  path: string | null;
  plugins: OpenCodexPluginSummary[];
};

/**
 * Plugin summary displayed in the plugin store.
 */
export type OpenCodexPluginSummary = {
  id: string;
  name: string;
  marketplaceName: string;
  marketplaceDisplayName: string;
  marketplacePath: string | null;
  displayName: string;
  shortDescription: string | null;
  longDescription: string | null;
  developerName: string | null;
  category: string | null;
  capabilities: string[];
  keywords: string[];
  installed: boolean;
  enabled: boolean;
  installPolicy: OpenCodexPluginInstallPolicy;
  availability: OpenCodexPluginAvailability;
  authPolicy: string;
  sourceType: OpenCodexPluginSourceType;
  logoUrl: string | null;
  composerIconUrl: string | null;
  isFeatured: boolean;
};

/**
 * Skill provided by a plugin.
 */
export type OpenCodexPluginSkillSummary = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  enabled: boolean;
};

/**
 * App connector provided by a plugin.
 */
export type OpenCodexPluginAppSummary = {
  id: string;
  name: string;
  description: string | null;
  installUrl: string | null;
  needsAuth: boolean;
};

/**
 * Hook provided by a plugin.
 */
export type OpenCodexPluginHookSummary = {
  key: string;
  eventName: string;
};

/**
 * Detailed plugin metadata loaded on demand.
 */
export type OpenCodexPluginDetail = {
  marketplaceName: string;
  marketplacePath: string | null;
  summary: OpenCodexPluginSummary;
  description: string | null;
  skills: OpenCodexPluginSkillSummary[];
  hooks: OpenCodexPluginHookSummary[];
  apps: OpenCodexPluginAppSummary[];
  mcpServers: string[];
};

/**
 * Full plugin list grouped by marketplace.
 */
export type OpenCodexPluginListResult = {
  sourceId: string | null;
  marketplaces: OpenCodexPluginMarketplace[];
  featuredPluginIds: string[];
  categories: string[];
  loadErrors: string[];
};

/**
 * Result returned after installing a plugin.
 */
export type OpenCodexPluginInstallResult = {
  ok: true;
  authPolicy: string | null;
  appsNeedingAuth: OpenCodexPluginAppSummary[];
};

/**
 * Persisted application settings shared by backend and UI.
 */
export type OpenCodexSettings = {
  codexCommand: string;
  codexReleaseCheck: OpenCodexCodexReleaseCheck;
  defaultSourceId: string | null;
  defaultUsageLimitId: string | null;
  defaultModel: string | null;
  defaultReasoningEffort: OpenCodexReasoningEffort | null;
  commitMessageModel: string | null;
  commitMessageReasoningEffort: OpenCodexReasoningEffort | null;
  commitMessageLanguage: OpenCodexCommitMessageLanguage;
  showActivityPanel: boolean;
  experimentalApi: boolean;
  allowTurnSteering: boolean;
  language: OpenCodexLanguage;
  colorScheme: OpenCodexColorScheme;
  enterKeyBehavior: OpenCodexEnterKeyBehavior;
  versioningVocabulary: OpenCodexVersioningVocabulary;
  discordRichPresenceEnabled: boolean;
  onboardingCompleted: boolean;
  allowOutdatedCodex: boolean;
  developerMode: boolean;
  performanceMonitoringEnabled: boolean;
  advancedPerformanceMonitoringEnabled: boolean;
};

/**
 * Thread metadata shown in project chat lists.
 */
export type OpenCodexThread = {
  id: string;
  sessionId: string | null;
  parentThreadId: string | null;
  codexTitle: string;
  customTitle: string | null;
  title: string;
  preview: string;
  model: string | null;
  reasoningEffort: OpenCodexReasoningEffort | null;
  projectName: string | null;
  projectPath: string | null;
  sourceId: string | null;
  branchName: string | null;
  updatedAt: string | null;
  isArchived: boolean;
  threadSource: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  status?: string;
};

/**
 * Message role used by flattened message and turn item DTOs.
 */
export type OpenCodexMessageRole = "user" | "assistant" | "system" | "activity";

/**
 * Message lifecycle status used by streaming UI.
 */
export type OpenCodexMessageStatus = "streaming" | "completed" | "error";

/**
 * Image attachment sent with a user message.
 */
export type OpenCodexImageAttachment = {
  id: string;
  kind: "image";
  source: "dataUrl" | "localPath";
  value: string;
  name?: string | null;
  previewUrl?: string | null;
};

/**
 * Legacy flattened message DTO kept for compatibility with UI flows.
 */
export type OpenCodexMessage = {
  id: string;
  threadId: string;
  role: OpenCodexMessageRole;
  content: string;
  status: OpenCodexMessageStatus;
  createdAt: string | null;
  turnId?: string;
  turnDurationMs?: number | null;
  itemId?: string;
  phase?: OpenCodexMessagePhase | null;
  kind?: string;
  summary?: string | null;
  details?: string | null;
  attachments?: OpenCodexImageAttachment[];
};

/**
 * Structured item inside an OpenCodex turn.
 */
export type OpenCodexTurnItem = {
  id: string;
  role: OpenCodexMessageRole;
  content: string;
  status: OpenCodexMessageStatus;
  createdAt: string | null;
  phase?: OpenCodexMessagePhase | null;
  kind?: string;
  summary?: string | null;
  details?: string | null;
  attachments?: OpenCodexImageAttachment[];
};

/**
 * Structured turn shown by the chat UI.
 */
export type OpenCodexTurn = {
  id: string;
  threadId: string;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  items: OpenCodexTurnItem[];
};

/**
 * Runtime activity state for one Codex thread.
 */
export type OpenCodexThreadRuntimeStatus = {
  threadId: string;
  status: "active" | "idle" | "notLoaded" | "systemError" | "unknown";
  isActive: boolean | null;
  activeFlags: string[];
};

/**
 * Live or historical activity item displayed in reasoning blocks.
 */
export type OpenCodexActivity = {
  id: string;
  threadId: string;
  kind: string;
  title?: string;
  content?: string;
  summary?: string | null;
  details?: string | null;
  status: "running" | "completed" | "error";
};

/**
 * Approval request displayed to the user.
 */
export type OpenCodexApproval = {
  id: string;
  sourceId?: string | null;
  threadId?: string;
  title: string;
  kind: "command" | "fileChange" | "permissions" | "other";
  body: string;
  reason?: string | null;
  command?: string | null;
  cwd?: string | null;
  grantRoot?: string | null;
  permissions?: unknown;
  choices: OpenCodexApprovalDecision[];
};
