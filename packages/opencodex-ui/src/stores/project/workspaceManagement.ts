import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceActivity, OpenCodexWorkspaceLockState } from
  "@open-codex-ui/opencodex-protocol";
import { isWorkspaceRetention } from "@open-codex-ui/opencodex-protocol";

/** Advisory classification; only the existing removal backend can establish safe deletion. */
export type WorkspaceManagementStatus = "primary" | "imported" | "removed" | "pending" | "busy"
  | "offline" | "lockUnknown" | "locked" | "activityUnknown" | "inProgress" | "retained" | "recent" | "candidate";

/** Captured inputs keep age decisions deterministic and independent of the selected conversation. */
export interface WorkspaceManagementInput {
  workspace: OpenCodexProjectWorkspace;
  activity?: OpenCodexWorkspaceActivity;
  lock?: OpenCodexWorkspaceLockState;
  hasLocalActivity: boolean;
  hasUnsavedDocuments: boolean;
  sourceAvailable: boolean;
  checking: boolean;
  retentionDays: number | null;
  now: number;
}

/** Discards statistics whose owning source or physical path no longer matches the displayed checkout. */
export function matchingWorkspaceActivity(workspace: OpenCodexProjectWorkspace,
  activity: OpenCodexWorkspaceActivity | undefined): OpenCodexWorkspaceActivity | undefined {
  if (activity?.workspaceId !== workspace.id || activity.sourceId !== workspace.sourceId
    || activity.workspacePath !== workspace.path) return undefined;
  return activity;
}

/** Excludes uncertain states and workspaces whose activity cannot be dated before suggesting inspection. */
export function workspaceManagementStatus(input: WorkspaceManagementInput): WorkspaceManagementStatus {
  const { workspace, activity, lock } = input;
  if (workspace.removedAt !== null) return "removed";
  if (workspace.isPrimary) return "primary";
  if (!workspace.managed) return "imported";
  if (workspace.movePending === true || workspace.removalPending === true) return "pending";
  if (input.hasLocalActivity || input.hasUnsavedDocuments) return "busy";
  const matchingActivity = matchingWorkspaceActivity(workspace, activity);
  if (matchingActivity !== undefined && (matchingActivity.activeConversationCount > 0 || matchingActivity.pendingOperationCount > 0)) return "busy";
  if (!input.sourceAvailable || workspace.sourceId === null) return "offline";
  if (input.checking || lock === undefined || lock.workspaceId !== workspace.id
    || lock.sourceId !== workspace.sourceId || lock.workspacePath !== workspace.path || !lock.supported) return "lockUnknown";
  if (lock.lockedReason !== null) return "locked";
  if (workspace.workStatus !== "completed") return "inProgress";
  if (input.retentionDays === null) return "retained";
  if (matchingActivity === undefined || matchingActivity.lastActivityAt === null) return "activityUnknown";
  const completedAt = Date.parse(workspace.completedAt ?? "");
  const lastActivity = Date.parse(matchingActivity.lastActivityAt);
  if (!Number.isFinite(lastActivity) || !Number.isFinite(input.now) || lastActivity > input.now
    || !Number.isFinite(completedAt) || completedAt > input.now
    || !isWorkspaceRetention({ days: input.retentionDays })) return "activityUnknown";
  const cutoff = input.now - input.retentionDays * 86_400_000;
  if (Math.max(lastActivity, completedAt) > cutoff) return "recent";
  return "candidate";
}
