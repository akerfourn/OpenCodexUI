import type { OpenCodexWorkspaceCreation, OpenCodexWorkspaceStart } from
  "@open-codex-ui/opencodex-protocol";

/** Creation input captured after source-local repository identity validation. */
export interface WorkspaceCreationInput {
  /** Existing source-owned primary identity. */
  primaryWorkspaceId: string;
  /** Backend-generated identity used to derive the automatic destination. */
  workspaceId?: string;
  /** Source-owned storage root snapshot for automatic parent creation. */
  rootPath?: string | null;
  /** Explicit owner of every captured source path. */
  sourceId: string;
  /** Primary path checked against current persistence. */
  projectPath: string;
  /** Source-local common Git directory reserved exclusively. */
  repositoryPath: string;
  /** New path reserved against premature thread adoption. */
  destinationPath: string;
  /** Display name captured with the durable creation intent. */
  name?: string | null;
  /** Frozen user checkout choice. */
  start: OpenCodexWorkspaceStart;
}

/** Owns the creation journal and atomic publication of managed workspaces. */
export interface WorkspaceCreationRepository {
  /** Atomically reserves repository and destination identities. */
  begin(input: WorkspaceCreationInput): Promise<OpenCodexWorkspaceCreation>;
  /** Reads one persisted intent without source access. */
  get(id: string): Promise<OpenCodexWorkspaceCreation | null>;
  /** Lists the project's incomplete creations. */
  list(projectId: string): Promise<OpenCodexWorkspaceCreation[]>;
  /** Freezes the expected checkout before sending the Git mutation. */
  submitting(id: string, head: string, branch: string | null): Promise<void>;
  /** Persists successful command completion before further I/O. */
  confirmGit(id: string): Promise<void>;
  /** Cancels preparation or preserves uncertain dispatched effects. */
  fail(id: string): Promise<void>;
  /** Publishes a verified managed workspace atomically with journal removal. */
  commit(id: string): Promise<string>;
}
