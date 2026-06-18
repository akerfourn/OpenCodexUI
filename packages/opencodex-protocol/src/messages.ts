/**
 * Declares the shared protocol types exchanged between the UI, backend, and transport layers.
 */
export type OpenCodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type OpenCodexMessagePhase = "commentary" | "final_answer";
export type OpenCodexColorScheme = "light" | "dark" | "system";
export type OpenCodexEnterKeyBehavior = "newline" | "send" | "smart";
export type OpenCodexCommitMessageLanguage = "en" | "fr";
export type OpenCodexVersioningVocabulary = "simple" | "technical";
export type OpenCodexLogType = "error" | "warning" | "info";
export type OpenCodexLogRetentionUnit = "hours" | "days" | "weeks" | "months";

export type OpenCodexExecPolicyAmendment = string[];

export type OpenCodexNetworkPolicyAmendment = {
  host: string;
  action: "allow" | "deny";
};

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

export type OpenCodexThreadScope = "currentProject" | "all";
export type OpenCodexLanguage = "system" | "fr" | "en";
export type OpenCodexSourceKind = "local";
export type OpenCodexSourceCommandMode = "auto" | "custom";
export type OpenCodexSourceColor = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "teal";
export type OpenCodexToolAvailabilityStatus = "ready" | "outdated" | "unavailable";
export type OpenCodexServiceTier = string;

export type OpenCodexModelServiceTier = {
  id: OpenCodexServiceTier;
  name: string;
  description: string;
};

export type OpenCodexModel = {
  id: string;
  model: string;
  displayName: string;
  serviceTiers: OpenCodexModelServiceTier[];
};

export type OpenCodexToolVersionStatus = {
  status: OpenCodexToolAvailabilityStatus;
  version: string | null;
  message: string | null;
  checkedAt: string;
};

export type OpenCodexCommandCandidate = {
  command: string;
  codex: OpenCodexToolVersionStatus;
};

export type OpenCodexSourceLocalSettings = {
  commandMode: OpenCodexSourceCommandMode;
  command: string | null;
  color: OpenCodexSourceColor;
  openFolderCommand: string | null;
  openFileCommand: string | null;
};

export type OpenCodexSourceBase = {
  id: string;
  kind: OpenCodexSourceKind;
  name: string;
  associatedProjectCount: number;
  codex: OpenCodexToolVersionStatus;
  createdAt: string;
  updatedAt: string;
};

export type OpenCodexLocalSource = OpenCodexSourceBase & {
  kind: "local";
  settings: OpenCodexSourceLocalSettings;
  resolvedCommand: string;
  commandCandidates: OpenCodexCommandCandidate[];
};

export type OpenCodexSource = OpenCodexLocalSource;

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

export type OpenCodexProjectPreferences = {
  git?: {
    referenceTagName?: string | null;
  };
  context?: {
    permissionsProfileId?: string | null;
    folders?: OpenCodexProjectContextFolder[];
    lastSyncedAt?: string | null;
  };
};

export type OpenCodexProjectContextFolder = {
  id: string;
  path: string;
  label: string | null;
  enabled: boolean;
};

export type OpenCodexFileSearchResult = {
  root: string;
  path: string;
  relativePath: string;
  fileName: string;
  matchType: "file" | "directory";
};

export type OpenCodexSkillSearchResult = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  path: string;
  scope: string;
};

export type OpenCodexComposerReference =
  | {
      type: "skill";
      name: string;
      path: string;
    };

export type OpenCodexLogEntry = {
  id: string;
  type: OpenCodexLogType;
  message: string;
  details: unknown;
  createdAt: string;
};

export type OpenCodexLogPage = {
  logs: OpenCodexLogEntry[];
  hasMore: boolean;
};

export type OpenCodexGitFileState =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "unknown";

export type OpenCodexGitFile = {
  path: string;
  originalPath: string | null;
  status: OpenCodexGitFileState;
  stagedStatus: OpenCodexGitFileState | null;
  unstagedStatus: OpenCodexGitFileState | null;
};

export type OpenCodexGitStatus = {
  isRepository: boolean;
  aheadCount: number;
  behindCount: number;
  branchName: string | null;
  upstreamName: string | null;
  pendingCommitMessage: string | null;
  changedFiles: OpenCodexGitFile[];
  stagedFiles: OpenCodexGitFile[];
};

export type OpenCodexGitBranchKind = "local" | "remote";

export type OpenCodexGitBranch = {
  name: string;
  fullName: string;
  kind: OpenCodexGitBranchKind;
  upstreamName: string | null;
  isCurrent: boolean;
};

export type OpenCodexGitTag = {
  name: string;
  fullName: string;
  targetHash: string | null;
  createdAt: string | null;
};

export type OpenCodexGitLogCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string | null;
  subject: string;
  refs: string[];
};

export type OpenCodexGitLogPage = {
  commits: OpenCodexGitLogCommit[];
  hasMore: boolean;
};

export type OpenCodexGitCommitFileChange = {
  status: OpenCodexGitFileState;
  path: string;
  originalPath: string | null;
};

export type OpenCodexGitCommitDetails = {
  hash: string;
  message: string;
  files: OpenCodexGitCommitFileChange[];
};

export type OpenCodexGitCommitResult = {
  ok: true;
  output: string;
};

export type OpenCodexUsageWindow = {
  label: "5h" | "weekly" | "usage";
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: string | null;
};

export type OpenCodexUsageCredits = {
  hasCredits: boolean;
  unlimited: boolean;
  balance: string | null;
};

export type OpenCodexUsageLimits = {
  limitId: string | null;
  limitName: string | null;
  planType: string | null;
  primary: OpenCodexUsageWindow | null;
  secondary: OpenCodexUsageWindow | null;
  credits: OpenCodexUsageCredits | null;
};

export type OpenCodexUsageSnapshot = {
  limits: OpenCodexUsageLimits[];
  updatedAt: string;
};

export type OpenCodexThreadTokenUsageBreakdown = {
  totalTokens: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
};

export type OpenCodexThreadTokenUsage = {
  threadId: string;
  turnId: string;
  total: OpenCodexThreadTokenUsageBreakdown;
  last: OpenCodexThreadTokenUsageBreakdown;
  contextWindowTokens: number;
  modelContextWindow: number | null;
  usedPercent: number | null;
};

export type OpenCodexCommitPrompt = {
  prompt: string;
  defaultPrompt: string;
  isDefault: boolean;
};

export type OpenCodexCommitMessageGenerationResult = {
  message: string;
};

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

export type OpenCodexProjectCommandRunStatus = "running" | "exited" | "failed" | "killed";

export type OpenCodexProjectCommandOutputStream = "stdout" | "stderr";

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

export type OpenCodexProjectTaskStatus = "todo" | "inProgress" | "toValidate" | "done";

export type OpenCodexProjectTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: OpenCodexProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type OpenCodexPluginInstallPolicy =
  | "available"
  | "notAvailable"
  | "installedByDefault"
  | "unknown";

export type OpenCodexPluginAvailability = "available" | "disabledByAdmin" | "unknown";

export type OpenCodexPluginSourceType = "local" | "git" | "remote" | "unknown";

export type OpenCodexPluginMarketplace = {
  name: string;
  displayName: string;
  path: string | null;
  plugins: OpenCodexPluginSummary[];
};

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

export type OpenCodexPluginSkillSummary = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  enabled: boolean;
};

export type OpenCodexPluginAppSummary = {
  id: string;
  name: string;
  description: string | null;
  installUrl: string | null;
  needsAuth: boolean;
};

export type OpenCodexPluginHookSummary = {
  key: string;
  eventName: string;
};

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

export type OpenCodexPluginListResult = {
  sourceId: string | null;
  marketplaces: OpenCodexPluginMarketplace[];
  featuredPluginIds: string[];
  categories: string[];
  loadErrors: string[];
};

export type OpenCodexPluginInstallResult = {
  ok: true;
  authPolicy: string | null;
  appsNeedingAuth: OpenCodexPluginAppSummary[];
};

export type OpenCodexSettings = {
  codexCommand: string;
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
};

export type OpenCodexThread = {
  id: string;
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
  status?: string;
};

export type OpenCodexMessageRole = "user" | "assistant" | "system" | "activity";

export type OpenCodexMessageStatus = "streaming" | "completed" | "error";

export type OpenCodexImageAttachment = {
  id: string;
  kind: "image";
  source: "dataUrl" | "localPath";
  value: string;
  name?: string | null;
  previewUrl?: string | null;
};

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

export type OpenCodexTurn = {
  id: string;
  threadId: string;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  items: OpenCodexTurnItem[];
};

export type OpenCodexThreadRuntimeStatus = {
  threadId: string;
  status: "active" | "idle" | "notLoaded" | "systemError" | "unknown";
  isActive: boolean | null;
  activeFlags: string[];
};

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

export type OpenCodexApproval = {
  id: string;
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
