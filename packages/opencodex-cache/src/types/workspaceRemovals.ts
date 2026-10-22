import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";

/** Database guards for physical removal; no filesystem effects belong here. */
export interface WorkspaceRemovalRepository {
  /** Reserves a managed secondary, its primary identity and repository. */
  begin(projectId: string, workspaceId: string, sourceId: string,
    primaryWorkspaceId: string, repositoryPath: string): Promise<OpenCodexWorkspaceRemoval>;
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
