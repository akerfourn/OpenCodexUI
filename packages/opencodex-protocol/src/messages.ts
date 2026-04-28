export type OpenCodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type OpenCodexMessagePhase = "commentary" | "final_answer";

export type OpenCodexApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

export type OpenCodexThreadScope = "currentProject" | "all";

export type OpenCodexSettings = {
  codexCommand: string;
  defaultModel: string | null;
  defaultReasoningEffort: OpenCodexReasoningEffort | null;
  showActivityPanel: boolean;
  experimentalApi: boolean;
};

export type OpenCodexThread = {
  id: string;
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
  itemId?: string;
  phase?: OpenCodexMessagePhase | null;
  kind?: string;
  summary?: string | null;
  details?: string | null;
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
  kind: "command" | "fileChange" | "other";
  body: string;
  choices: OpenCodexApprovalDecision[];
};
