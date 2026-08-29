import type {
  OpenCodexApprovalDecision,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort
} from "./foundations.js";
import type { OpenCodexServiceTier } from "./sources.js";
import type { OpenCodexThreadTokenUsage } from "./usage.js";

/**
 * Structured origin metadata reported for a Codex sub-agent thread.
 */
export type OpenCodexSubAgentSource = {
  kind: "review" | "compact" | "threadSpawn" | "memoryConsolidation" | "other";
  parentThreadId: string | null;
  depth: number | null;
  agentPath: string | null;
  agentNickname: string | null;
  agentRole: string | null;
  label: string | null;
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
  subAgentSource: OpenCodexSubAgentSource | null;
  /** Current App Server capability; cached-only threads intentionally expose `null`. */
  canAcceptDirectInput: boolean | null;
  status?: string;
};

/** Lifecycle status reported by the native Codex goal runtime. */
export type OpenCodexThreadGoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete";

/** Native Codex goal state attached to one thread. */
export type OpenCodexThreadGoal = {
  threadId: string;
  objective: string;
  status: OpenCodexThreadGoalStatus;
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
};

/** Optional fields accepted when creating or updating a native goal. */
export type OpenCodexThreadGoalPatch = {
  objective?: string | null;
  status?: OpenCodexThreadGoalStatus | null;
  tokenBudget?: number | null;
};

/**
 * Message role used by flattened message and turn item DTOs.
 */
export type OpenCodexMessageRole = "user" | "assistant" | "system" | "activity";

/**
 * Message lifecycle status used by streaming UI.
 */
export type OpenCodexMessageStatus = "streaming" | "completed" | "error";

/** One structured step in a Codex plan snapshot. */
export type OpenCodexPlanStep = {
  step: string;
  status: "pending" | "inProgress" | "completed";
};

/** Structured plan data preserved alongside its legacy text projection. */
export type OpenCodexPlanSnapshot = {
  explanation: string | null;
  steps: OpenCodexPlanStep[];
};

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
  plan?: OpenCodexPlanSnapshot | null;
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
  plan?: OpenCodexPlanSnapshot | null;
  attachments?: OpenCodexImageAttachment[];
};

/**
 * Model and execution settings observed for one Codex turn.
 */
export type OpenCodexTurnExecutionMetadata = {
  requestedModel: string | null;
  effectiveModel: string | null;
  requestedReasoningEffort: OpenCodexReasoningEffort | null;
  effectiveReasoningEffort: OpenCodexReasoningEffort | null;
  serviceTier: OpenCodexServiceTier | null;
};

/**
 * Structured turn shown by the chat UI.
 */
export type OpenCodexTurn = {
  id: string;
  threadId: string;
  status: string | null;
  errorMessage?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  execution?: OpenCodexTurnExecutionMetadata | null;
  tokenUsage?: OpenCodexThreadTokenUsage | null;
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
  plan?: OpenCodexPlanSnapshot | null;
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
