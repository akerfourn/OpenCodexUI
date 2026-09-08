import type { OpenCodexProjectGoalStatus } from "@open-codex-ui/opencodex-protocol";

/** Lifecycle status persisted for one project goal. */
export type CachedProjectGoalStatus = OpenCodexProjectGoalStatus;

/** Cached project goal definition and execution metadata. */
export type CachedProjectGoal = {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  tokenBudget: number | null;
  status: CachedProjectGoalStatus;
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

/** Input used to create a cached project goal draft. */
export type CachedProjectGoalCreateInput = {
  projectId: string;
  name: string;
  objective: string;
  tokenBudget: number | null;
};

/** Editable fields accepted while a goal is still a draft. */
export type CachedProjectGoalUpdateInput = {
  name?: string;
  objective?: string;
  tokenBudget?: number | null;
};
