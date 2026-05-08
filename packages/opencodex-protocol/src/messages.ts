/**
 * Declares the shared protocol types exchanged between the UI, backend, and transport layers.
 */
export type OpenCodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type OpenCodexMessagePhase = "commentary" | "final_answer";

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

export type OpenCodexProject = {
  id: string;
  path: string;
  defaultName: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
};

export type OpenCodexSettings = {
  codexCommand: string;
  defaultModel: string | null;
  defaultReasoningEffort: OpenCodexReasoningEffort | null;
  showActivityPanel: boolean;
  experimentalApi: boolean;
  language: OpenCodexLanguage;
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
  branchName: string | null;
  updatedAt: string | null;
  status?: string;
};

export type OpenCodexMessageRole = "user" | "assistant" | "system" | "activity";

export type OpenCodexMessageStatus = "streaming" | "completed" | "error";

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
