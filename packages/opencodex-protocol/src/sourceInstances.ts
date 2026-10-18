/** Content-free reasons for activity; request arguments and thread content never cross this boundary. */
export interface SourceInstanceActivity {
  requestMethods: string[];
  turnCount: number;
  threadCount: number;
  approvalCount: number;
  processCount: number;
}

/** Lifecycle of an app-server owned by OpenCodexUI, independent of CLI version detection. */
export interface SourceInstanceSnapshot {
  sourceId: string;
  phase: "stopped" | "starting" | "ready" | "stopping" | "error";
  isActive: boolean;
  manuallyStopped: boolean;
  error: string | null;
  activity?: SourceInstanceActivity;
}

/** Explicit controls; forcing interruption requires a separate confirmation in the UI. */
export type SourceInstanceRequest =
  | { type: "sourceInstances.list" }
  | { type: "sourceInstances.start"; sourceId: string }
  | { type: "sourceInstances.stop" | "sourceInstances.restart"; sourceId: string; force: boolean };
