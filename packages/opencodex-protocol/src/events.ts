import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexMessage,
  OpenCodexSettings,
  OpenCodexThread
} from "./messages";

export type OpenCodexEvent =
  | { type: "connection.status"; status: "starting" | "ready" | "stopped" | "error"; message?: string }
  | { type: "app.bootstrap"; settings: OpenCodexSettings; projectPath: string | null }
  | { type: "threads.updated"; threads: OpenCodexThread[]; currentProjectFilterAvailable: boolean }
  | { type: "thread.opened"; thread: OpenCodexThread; messages: OpenCodexMessage[] }
  | { type: "thread.created"; thread: OpenCodexThread; messages: OpenCodexMessage[] }
  | { type: "thread.renamed"; threadId: string; name: string }
  | { type: "message.started"; threadId: string; message: OpenCodexMessage }
  | { type: "message.delta"; threadId: string; messageId: string; turnId: string; delta: string; phase?: OpenCodexMessage["phase"] }
  | { type: "message.completed"; threadId: string; messageId: string }
  | { type: "activity.started"; threadId: string; activity: OpenCodexActivity }
  | { type: "activity.updated"; threadId: string; activity: OpenCodexActivity }
  | { type: "activity.completed"; threadId: string; activityId: string }
  | { type: "approval.requested"; approval: OpenCodexApproval }
  | { type: "approval.resolved"; approvalId: string }
  | { type: "turn.started"; threadId: string; turnId: string }
  | { type: "turn.completed"; threadId: string; turnId: string; durationMs: number | null }
  | { type: "models.updated"; models: string[] }
  | { type: "error"; message: string; details?: unknown };
