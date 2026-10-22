import type { OpenCodexWorkspaceMove } from "@open-codex-ui/opencodex-protocol";

/** Source facts captured by the backend before a physical move is dispatched. */
export type WorkspaceMoveInput = Omit<OpenCodexWorkspaceMove, "id" | "state" | "gitExitCode">;

/** Durable move reservation and atomic publication; no filesystem operations. */
export interface WorkspaceMoveRepository {
  /** Reserves the repository, target identity and destination against conflicting operations. */
  begin(input: WorkspaceMoveInput): Promise<OpenCodexWorkspaceMove>;
  /** Reads one operation or a project's pending operations without a running source. */
  get(id: string): Promise<OpenCodexWorkspaceMove | null>;
  list(projectId: string): Promise<OpenCodexWorkspaceMove[]>;
  /** Records dispatch before Git can mutate paths. */
  submitting(id: string): Promise<void>;
  /** Saves positive process-exit evidence before further source IO. */
  confirmGit(id: string, exitCode: number): Promise<void>;
  /** Cancels preparation, retaining dispatched operations as uncertain. */
  fail(id: string): Promise<void>;
  /** Cancels only undispatched or positively failed moves after source validation. */
  cancel(id: string): Promise<void>;
  /** Publishes a verified destination, aliases and pending conversation policy reloads atomically. */
  commit(id: string): Promise<void>;
}
