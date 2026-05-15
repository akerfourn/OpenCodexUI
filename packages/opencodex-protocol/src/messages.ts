/**
 * Declares the shared protocol types exchanged between the UI, backend, and transport layers.
 */
export type OpenCodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type OpenCodexMessagePhase = "commentary" | "final_answer";
export type OpenCodexColorScheme = "light" | "dark" | "system";
export type OpenCodexEnterKeyBehavior = "newline" | "send" | "smart";
export type OpenCodexCommitMessageLanguage = "en" | "fr";
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

export type OpenCodexSourceLocalSettings = {
  commandMode: OpenCodexSourceCommandMode;
  command: string | null;
  color: OpenCodexSourceColor;
};

export type OpenCodexSourceBase = {
  id: string;
  kind: OpenCodexSourceKind;
  name: string;
  associatedProjectCount: number;
  createdAt: string;
  updatedAt: string;
};

export type OpenCodexLocalSource = OpenCodexSourceBase & {
  kind: "local";
  settings: OpenCodexSourceLocalSettings;
  resolvedCommand: string;
};

export type OpenCodexSource = OpenCodexLocalSource;

export type OpenCodexProject = {
  id: string;
  sourceId: string | null;
  path: string;
  defaultName: string;
  displayName: string | null;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
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
  changedFiles: OpenCodexGitFile[];
  stagedFiles: OpenCodexGitFile[];
};

export type OpenCodexGitCommitResult = {
  ok: true;
  output: string;
};

export type OpenCodexCommitPrompt = {
  prompt: string;
  defaultPrompt: string;
  isDefault: boolean;
};

export type OpenCodexCommitMessageGenerationResult = {
  message: string;
};

export type OpenCodexSettings = {
  codexCommand: string;
  defaultSourceId: string | null;
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
