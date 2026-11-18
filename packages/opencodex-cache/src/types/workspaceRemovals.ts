import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";

/** Database guards for physical removal; no filesystem effects belong here. */
export interface WorkspaceRemovalRepository {
  /** Reserves a managed secondary, its primary identity and repository. */
  begin(projectId: string, workspaceId: string, sourceId: string,
    primaryWorkspaceId: string, repositoryPath: string, deferred?: boolean): Promise<OpenCodexWorkspaceRemoval>;
  /** Lists automatic requests that have not crossed the dispatch boundary. */
  queued(): Promise<OpenCodexWorkspaceRemoval[]>;
  /** Claims a waiting request once, before source validation. */
  claim(id: string): Promise<boolean>;
  /** Returns an undispatched request to the queue, or records a safety failure. */
  defer(id: string, reason: string | null): Promise<void>;
  /** Explicitly retries a blocked request or cancels waiting intent with ownership checks. */
  updateDeferred(id: string, projectId: string, sourceId: string, action: "cancel" | "retry"): Promise<void>;
  /** Reads an interrupted operation independently of source availability. */
  get(id: string): Promise<OpenCodexWorkspaceRemoval | null>;
  /** Lists unresolved removals for one logical project. */
  list(projectId: string): Promise<OpenCodexWorkspaceRemoval[]>;
  /** Records intent immediately before dispatching the destructive command. */
  submitting(id: string): Promise<void>;
  /** Records process completion before further verification. */
  confirmGit(id: string, exitCode: number): Promise<void>;
  /** Cancels preparation; dispatched effects retain their guards. */
  fail(id: string): Promise<void>;
  /** Cancels only undispatched or positively failed operations verified by the backend. */
  cancel(id: string): Promise<void>;
  /** Marks the workspace removed without touching threads, turns or branch data. */
  commit(id: string): Promise<void>;
}
