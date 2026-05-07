/**
 * Declares the backend events emitted to the OpenCodex UI.
 */
import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexMessage,
  OpenCodexProject,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexTurn
} from "./messages";

export type OpenCodexEvent =
  | { type: "connection.status"; status: "starting" | "ready" | "stopped" | "error"; message?: string }
  | { type: "app.bootstrap"; settings: OpenCodexSettings; projectPath: string | null }
  | { type: "projects.updated"; projects: OpenCodexProject[] }
  | { type: "project.opened"; project: OpenCodexProject }
  | {
      type: "threads.updated";
      threads: OpenCodexThread[];
      currentProjectFilterAvailable: boolean;
      projectPath: string | null;
    }
  | { type: "thread.opened"; thread: OpenCodexThread; turns: OpenCodexTurn[]; hasMoreOlderMessages?: boolean }
  | { type: "thread.created"; thread: OpenCodexThread; turns: OpenCodexTurn[] }
  | { type: "thread.metadata.updated"; thread: OpenCodexThread }
  | { type: "thread.turns.prepended"; threadId: string; turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }
  | { type: "thread.turns.synced"; threadId: string; turns: OpenCodexTurn[]; hasMoreOlderMessages: boolean }
  | { type: "thread.sync.started"; threadId: string }
  | { type: "thread.sync.completed"; threadId: string }
  | { type: "thread.recovery.started"; threadId: string }
  | { type: "thread.recovery.completed"; threadId: string }
  | { type: "thread.renamed"; threadId: string; name: string }
  | { type: "message.started"; threadId: string; message: OpenCodexMessage }
  | { type: "message.delta"; threadId: string; messageId: string; turnId: string; delta: string; phase?: OpenCodexMessage["phase"] }
  | { type: "message.completed"; threadId: string; messageId: string }
  | { type: "activity.started"; threadId: string; activity: OpenCodexActivity }
  | { type: "activity.updated"; threadId: string; activity: OpenCodexActivity }
  | { type: "activity.completed"; threadId: string; activityId: string }
  | { type: "approval.requested"; approval: OpenCodexApproval }
  | { type: "approval.resolved"; approvalId: string }
  | { type: "project.trust.required"; projectPath: string; disabledFolders: string[] }
  | { type: "project.trust.completed"; projectPath: string }
  | { type: "turn.started"; threadId: string; turnId: string }
  | { type: "turn.completed"; threadId: string; turnId: string; durationMs: number | null }
  | { type: "models.updated"; models: string[] }
  | { type: "error"; message: string; details?: unknown; recoverable?: boolean; threadId?: string };
