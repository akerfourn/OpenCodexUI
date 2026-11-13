import type { OpenCodexGitStatus } from "./messages/git.js";

/** Project preference used when both local and remote commits must be integrated. */
export type OpenCodexGitSyncStrategy = "rebase" | "merge";

/** Named destination explicitly reviewed before synchronization. */
export interface OpenCodexGitSyncTarget {
  remoteName: string;
  branchName: string;
  setUpstream: boolean;
}

/** Durable operation discovered in this worktree's own Git metadata. */
export interface OpenCodexGitSyncOperation {
  kind: "rebase" | "merge" | "other";
  fingerprint: string;
  branchName: string | null;
  conflicts: string[];
}

/** Local inspection, which never contacts a remote or changes the working tree. */
export interface OpenCodexGitSyncInspection {
  status: OpenCodexGitStatus;
  operation: OpenCodexGitSyncOperation | null;
  suggestedTarget: OpenCodexGitSyncTarget | null;
}

/** Immutable review snapshot; execution revalidates its identities and commit hashes. */
export interface OpenCodexGitSyncPlan {
  target: OpenCodexGitSyncTarget;
  pushUrl: string;
  branchName: string;
  localHead: string;
  remoteHead: string | null;
  aheadCount: number;
  behindCount: number;
  strategy: OpenCodexGitSyncStrategy;
  action: "none" | "push" | "fastForward" | "rebase" | "merge";
}

/** Stable user-facing reasons; unmodified technical output belongs in details. */
export type OpenCodexGitSyncIssue =
  | "notRepository" | "noCommits" | "detachedHead" | "noRemote" | "invalidTarget"
  | "dirtyWorktree" | "untrackedCollision" | "operationInProgress" | "unsupportedOperation"
  | "unsupportedRemote" | "unsupportedTracking" | "publishedCommits" | "protectedBranch"
  | "unrelatedHistories" | "reviewChanged" | "remoteChanged" | "conflicts"
  | "busy" | "gitFailed" | "trackingSetupFailed";

/** All normal Git failures are reviewable results instead of raw IPC errors. */
export interface OpenCodexGitSyncResult {
  outcome: "inspected" | "planned" | "synchronized" | "conflicts" | "continued" | "aborted" | "blocked" | "error";
  inspection: OpenCodexGitSyncInspection | null;
  plan: OpenCodexGitSyncPlan | null;
  issue: OpenCodexGitSyncIssue | null;
  details: string | null;
}

/** Physical source/worktree identity carried by every synchronization request. */
export interface OpenCodexGitSyncScope {
  projectId: string;
  workspaceId?: string;
  projectPath: string;
  sourceId: string | null;
}

/** Explicit synchronization phases, including restart-safe Git conflict recovery. */
export type OpenCodexGitSyncRequest = OpenCodexGitSyncScope & (
  | { type: "git.sync.inspect" }
  | { type: "git.sync.plan"; target: OpenCodexGitSyncTarget; strategy: OpenCodexGitSyncStrategy }
  | { type: "git.sync.execute"; plan: OpenCodexGitSyncPlan }
  | { type: "git.sync.resolve"; operation: OpenCodexGitSyncOperation; path: string }
  | { type: "git.sync.continue" | "git.sync.abort"; operation: OpenCodexGitSyncOperation }
);
