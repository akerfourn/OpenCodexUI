/** Lifecycle status for one OpenCodexUI project goal. */
export type OpenCodexProjectGoalStatus =
  | "draft"
  | "active"
  | "paused"
  | "blocked"
  | "usageLimited"
  | "budgetLimited"
  | "complete"
  | "error";

/** Project-level goal definition and its eventual native execution snapshot. */
export type OpenCodexProjectGoal = {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  tokenBudget: number | null;
  status: OpenCodexProjectGoalStatus;
  isArchived: boolean;
  sourceId: string | null;
  threadId: string | null;
  workspaceId: string | null;
  cwd: string | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  launchedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Input used to create a project goal draft. */
export type OpenCodexProjectGoalCreateInput = {
  projectId: string;
  name: string;
  objective: string;
  tokenBudget: number | null;
};

/** Editable fields for a project goal that has not started yet. */
export type OpenCodexProjectGoalPatch = {
  name?: string;
  objective?: string;
  tokenBudget?: number | null;
};
