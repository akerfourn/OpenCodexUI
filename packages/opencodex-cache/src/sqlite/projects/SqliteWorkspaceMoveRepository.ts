import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceMove } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceMoveInput, WorkspaceMoveRepository } from "../../types/workspaceMoves.js";
import { relocateWorkspace } from "./relocateWorkspace.js";

/** Explicit projection freezes source facts independently of subsequent settings edits. */
const columns = `id, workspace_id AS workspaceId, project_id AS projectId, source_id AS sourceId,
  primary_workspace_id AS primaryWorkspaceId, project_path AS projectPath, workspace_path AS workspacePath,
  destination_path AS destinationPath, repository_path AS repositoryPath, git_directory AS gitDirectory,
  root_path AS rootPath, expected_head AS expectedHead, expected_branch AS expectedBranch, state, git_exit_code AS gitExitCode`;

/** Persists movement without making the destination executable before verification. */
export class SqliteWorkspaceMoveRepository implements WorkspaceMoveRepository {
  /** Shares the cache connection and source-native ownership constraints. */
  constructor(private readonly database: Database) {}

  /** Freezes identity and reserves both paths; database triggers reject concurrent lifecycle work. */
  async begin(input: WorkspaceMoveInput): Promise<OpenCodexWorkspaceMove> {
    return this.database.transaction(() => {
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.expectedHead)) throw new Error("A complete Git commit is required.");
      const id = randomUUID();
      this.database.prepare(`INSERT INTO workspace_moves (id, workspace_id, project_id, source_id,
        primary_workspace_id, project_path, workspace_path, destination_path, repository_path,
        git_directory, root_path, expected_head, expected_branch, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing')`)
        .run(id, input.workspaceId, input.projectId, input.sourceId, input.primaryWorkspaceId, input.projectPath,
          input.workspacePath, input.destinationPath, input.repositoryPath, input.gitDirectory, input.rootPath,
          input.expectedHead, input.expectedBranch);
      return this.require(id);
    })();
  }

  /** Reads frozen recovery metadata without starting the owning source. */
  async get(id: string): Promise<OpenCodexWorkspaceMove | null> {
    return this.database.prepare(`SELECT ${columns} FROM workspace_moves WHERE id = ?`).get(id) as OpenCodexWorkspaceMove | undefined ?? null;
  }

  /** Lists pending movements for their logical project. */
  async list(projectId: string): Promise<OpenCodexWorkspaceMove[]> {
    return this.database.prepare(`SELECT ${columns} FROM workspace_moves WHERE project_id = ? ORDER BY id`)
      .all(projectId) as OpenCodexWorkspaceMove[];
  }

  /** Records dispatch before Git can rename anything. */
  async submitting(id: string): Promise<void> {
    const result = this.database.prepare("UPDATE workspace_moves SET state = 'submitting' WHERE id = ? AND state = 'preparing'").run(id);
    if (result.changes !== 1) throw new Error("Move is not ready for dispatch.");
  }

  /** Saves an observed exit independently of subsequent filesystem verification. */
  async confirmGit(id: string, exitCode: number): Promise<void> {
    if (!Number.isSafeInteger(exitCode)) throw new Error("A complete Git exit code is required.");
    const result = this.database.prepare("UPDATE workspace_moves SET git_exit_code = ? WHERE id = ? AND state = 'submitting'").run(exitCode, id);
    if (result.changes !== 1) throw new Error("Move is not awaiting Git completion.");
  }

  /** Preparation can be cancelled; dispatched failures keep both paths reserved. */
  async fail(id: string): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM workspace_moves WHERE id = ? AND state = 'preparing'").run(id);
      this.database.prepare("UPDATE workspace_moves SET state = 'uncertain' WHERE id = ?").run(id);
    })();
  }

  /** Requires preparation or positive failure evidence plus caller-verified original state. */
  async cancel(id: string): Promise<void> {
    const move = this.require(id);
    if (move.state !== "preparing" && (move.gitExitCode === null || move.gitExitCode === 0)) {
      throw new Error("An uncertain or successful move cannot be cancelled.");
    }
    this.database.prepare("DELETE FROM workspace_moves WHERE id = ?").run(id);
  }

  /** Releases the journal and publishes aliases, compatibility paths and reload requirements atomically. */
  async commit(id: string): Promise<void> {
    this.database.transaction(() => {
      const move = this.require(id);
      if (move.state === "preparing") throw new Error("Move has not been dispatched.");
      this.database.prepare("DELETE FROM workspace_moves WHERE id = ?").run(id);
      relocateWorkspace(this.database, move.workspaceId, move.destinationPath, move.workspacePath);
    })();
  }

  /** Requires the stored operation instead of reconstructing intent from UI paths. */
  private require(id: string): OpenCodexWorkspaceMove {
    const move = this.database.prepare(`SELECT ${columns} FROM workspace_moves WHERE id = ?`).get(id) as OpenCodexWorkspaceMove | undefined;
    if (move === undefined) throw new Error("Workspace move does not exist.");
    return move;
  }
}
