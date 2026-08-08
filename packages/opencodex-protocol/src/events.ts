/**
 * Declares the backend events emitted to the OpenCodex UI.
 */
import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexLogEntry,
  OpenCodexMessage,
  OpenCodexModel,
  OpenCodexProject,
  OpenCodexProjectCommandRun,
  OpenCodexProjectCommandOutputStream,
  OpenCodexProjectCommandRulesSnapshot,
  OpenCodexProjectGroupsSnapshot,
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexThread,
  OpenCodexThreadEventLogEntry,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn,
  OpenCodexUsageSnapshot
} from "./messages";
import type { OpenCodexCollaborationEvent } from "./collaboration";

/**
 * Event union emitted by the backend to update UI stores.
 *
 * Events are append-only protocol contracts: prefer adding variants or optional
 * fields over changing an existing payload in incompatible ways.
 */
export type OpenCodexEvent =
  | { type: "connection.status"; status: "starting" | "ready" | "stopped" | "error"; message?: string }
  | {
      type: "app.bootstrap";
      settings: OpenCodexSettings;
      sources: OpenCodexSource[];
      projectPath: string | null;
      appVersion: string | null;
      isPrerelease: boolean;
    }
  | { type: "projects.updated"; projects: OpenCodexProject[] }
  | { type: "projectGroups.updated"; snapshot: OpenCodexProjectGroupsSnapshot }
  | { type: "project.opened"; project: OpenCodexProject }
  | { type: "sources.updated"; sources: OpenCodexSource[]; defaultSourceId: string | null }
  | {
      type: "threads.updated";
      threads: OpenCodexThread[];
      currentProjectFilterAvailable: boolean;
      projectPath: string | null;
      archived: boolean;
    }
  | {
      type: "thread.opened";
      thread: OpenCodexThread;
      turns: OpenCodexTurn[];
      hasMoreOlderMessages?: boolean;
      tokenUsage?: OpenCodexThreadTokenUsage | null;
    }
  | { type: "thread.created"; thread: OpenCodexThread; turns: OpenCodexTurn[] }
  | { type: "thread.discovered"; thread: OpenCodexThread }
  | { type: "thread.metadata.updated"; thread: OpenCodexThread }
  | {
      type: "thread.turns.prepended";
      sourceId?: string | null;
      threadId: string;
      turns: OpenCodexTurn[];
      hasMoreOlderMessages: boolean;
    }
  | {
      type: "thread.turns.synced";
      sourceId?: string | null;
      threadId: string;
      turns: OpenCodexTurn[];
      hasMoreOlderMessages: boolean;
    }
  | { type: "thread.sync.started"; sourceId?: string | null; threadId: string }
  | { type: "thread.sync.completed"; sourceId?: string | null; threadId: string }
  | { type: "thread.recovery.started"; sourceId?: string | null; threadId: string }
  | { type: "thread.recovery.completed"; sourceId?: string | null; threadId: string }
  | {
      type: "thread.eventLog.updated";
      sourceId?: string | null;
      threadId: string;
      entry: OpenCodexThreadEventLogEntry;
    }
  | { type: "thread.renamed"; sourceId?: string | null; threadId: string; name: string }
  | { type: "thread.deleted"; sourceId?: string | null; threadId: string }
  | {
      type: "thread.tokenUsage.updated";
      sourceId?: string | null;
      usage: OpenCodexThreadTokenUsage;
    }
  | {
      type: "message.started";
      sourceId?: string | null;
      threadId: string;
      message: OpenCodexMessage;
    }
  | {
      type: "message.delta";
      sourceId?: string | null;
      threadId: string;
      messageId: string;
      turnId: string;
      delta: string;
      phase?: OpenCodexMessage["phase"];
    }
  | { type: "message.completed"; sourceId?: string | null; threadId: string; messageId: string }
  | {
      type: "activity.started";
      sourceId?: string | null;
      threadId: string;
      activity: OpenCodexActivity;
    }
  | {
      type: "activity.updated";
      sourceId?: string | null;
      threadId: string;
      activity: OpenCodexActivity;
    }
  | { type: "activity.completed"; sourceId?: string | null; threadId: string; activityId: string }
  | { type: "approval.requested"; approval: OpenCodexApproval }
  | { type: "approval.resolved"; approvalId: string }
  | {
      type: "app.navigation.requested";
      sourceId: string | null;
      threadId: string;
    }
  | { type: "project.trust.required"; projectPath: string; disabledFolders: string[] }
  | { type: "project.trust.completed"; projectPath: string }
  | { type: "turn.started"; sourceId?: string | null; threadId: string; turnId: string }
  | {
      type: "turn.completed";
      sourceId?: string | null;
      threadId: string;
      turnId: string;
      durationMs: number | null;
      turnStatus?: string;
      errorMessage?: string;
    }
  | { type: "models.updated"; models: OpenCodexModel[] }
  | { type: "usage.updated"; sourceId: string; usage: OpenCodexUsageSnapshot | null }
  | {
      type: "collaboration.updated";
      sourceId: string;
      event: OpenCodexCollaborationEvent;
    }
  | { type: "logs.created"; log: OpenCodexLogEntry }
  | { type: "logs.deleted"; logId: string }
  | { type: "logs.cleared" }
  | { type: "projectCommand.started"; projectId: string; run: OpenCodexProjectCommandRun }
  | {
      type: "projectCommand.output";
      projectId: string;
      commandId: string;
      runId: string;
      stream: OpenCodexProjectCommandOutputStream;
      delta: string;
    }
  | {
      type: "projectCommand.exited";
      projectId: string;
      commandId: string;
      runId: string;
      status: OpenCodexProjectCommandRun["status"];
      exitCode: number | null;
      exitedAt: string;
    }
  | { type: "projectRules.updated"; projectId: string; snapshot: OpenCodexProjectCommandRulesSnapshot }
  | {
      type: "error";
      message: string;
      details?: unknown;
      recoverable?: boolean;
      sourceId?: string | null;
      threadId?: string;
    };
