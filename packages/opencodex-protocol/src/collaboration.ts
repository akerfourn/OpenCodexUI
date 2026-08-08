/**
 * Normalized collaboration actions understood by OpenCodexUI.
 */
export type OpenCodexCollaborationAction =
  | "spawn"
  | "message"
  | "followup"
  | "interrupt"
  | "wait"
  | "resume"
  | "close"
  | "result";

/**
 * Lifecycle state of one normalized collaboration action.
 */
export type OpenCodexCollaborationStatus =
  | "pending"
  | "completed"
  | "failed"
  | "unknown";

/**
 * App Server evidence used to reconstruct one collaboration action.
 */
export type OpenCodexCollaborationEvidence =
  | "canonicalItem"
  | "rawFunctionCall"
  | "rawAgentMessage"
  | "structuralInference";

/**
 * Parent-history policy requested while spawning a sub-agent.
 */
export type OpenCodexForkTurns = "all" | "none" | number;

/**
 * Source-aware semantic representation of one inter-agent action.
 */
export type OpenCodexCollaborationEvent = {
  id: string;
  sourceId: string;
  threadId: string;
  turnId: string | null;
  callId: string | null;
  action: OpenCodexCollaborationAction;
  toolName: string | null;
  senderThreadId: string | null;
  senderAgentPath: string | null;
  receiverThreadIds: string[];
  receiverAgentPaths: string[];
  prompt: string | null;
  result: string | null;
  taskName: string | null;
  model: string | null;
  reasoningEffort: string | null;
  agentRole: string | null;
  forkTurns: OpenCodexForkTurns | null;
  status: OpenCodexCollaborationStatus;
  targetAgentStatuses: Record<string, string>;
  evidence: OpenCodexCollaborationEvidence[];
};

/**
 * Source-aware filters accepted when reading collaboration events.
 */
export type OpenCodexCollaborationQuery = {
  sourceId: string;
  threadId?: string;
  senderThreadId?: string;
  receiverThreadId?: string;
  rootThreadId?: string;
  limit?: number;
};
