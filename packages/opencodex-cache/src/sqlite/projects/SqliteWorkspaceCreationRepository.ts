import { defaultWorkspaceName, validateWorkspaceName } from "./workspaceName.js";
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceCreation } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceCreationInput, WorkspaceCreationRepository } from "../../types/workspaceCreations.js";

/** Explicit projection avoids exposing SQLite serialization details. */
const columns = `id, workspace_id AS workspaceId, project_id AS projectId, source_id AS sourceId,
  primary_workspace_id AS primaryWorkspaceId, project_path AS projectPath,
  repository_path AS repositoryPath, destination_path AS destinationPath, start_json AS startJson,
  name, root_path AS rootPath, state, expected_head AS expectedHead, expected_branch AS expectedBranch, git_confirmed AS gitConfirmed`;

/** Database-only representation of JSON and boolean fields. */
interface CreationRow extends Omit<OpenCodexWorkspaceCreation, "start" | "gitConfirmed"> {
  /** Serialized protocol checkout choice. */
  startJson: string;
  /** SQLite flag for a positively completed Git command. */
  gitConfirmed: number;
}

/** Journals creation separately from workspaces that are available for execution. */
export class SqliteWorkspaceCreationRepository implements WorkspaceCreationRepository {
  /** Shares the cache's transaction-capable connection. */
  constructor(private readonly database: Database) {}

  /** Atomically reserves a repository and an unused path under a source-owned primary. */
  async begin(input: WorkspaceCreationInput): Promise<OpenCodexWorkspaceCreation> {
    return this.database.transaction(() => {
      const name = input.name === null || input.name === undefined
        ? defaultWorkspaceName(input.destinationPath) : validateWorkspaceName(input.name);
      const primary = this.database.prepare(`SELECT project_id AS projectId FROM project_workspaces
        WHERE id = ? AND source_id = ? AND path = ? AND is_primary = 1 AND removed_at IS NULL`)
        .get(input.primaryWorkspaceId, input.sourceId, input.projectPath) as { projectId: string } | undefined;
      if (primary === undefined) {
        throw new Error("Creation requires an available primary workspace in the requested source.");
      }
      if (this.database.prepare(`SELECT id FROM project_workspaces
        WHERE source_id = ? AND path = ? AND removed_at IS NULL`)
        .get(input.sourceId, input.destinationPath) !== undefined) {
        throw new Error("Destination already belongs to a workspace.");
      }
      const id = randomUUID();
      this.database.prepare(`INSERT INTO workspace_creations
        (id, workspace_id, project_id, source_id, primary_workspace_id, project_path,
          repository_path, destination_path, start_json, name, root_path, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'preparing')`)
        .run(id, input.workspaceId ?? randomUUID(), primary.projectId, input.sourceId, input.primaryWorkspaceId,
          input.projectPath, input.repositoryPath, input.destinationPath, JSON.stringify(input.start), name, input.rootPath ?? null);
      return this.require(id);
    })();
  }

  /** Reads an interrupted creation without contacting its source. */
  async get(id: string): Promise<OpenCodexWorkspaceCreation | null> {
    const row = this.database.prepare(`SELECT ${columns} FROM workspace_creations WHERE id = ?`).get(id) as
      CreationRow | undefined;
    return row === undefined ? null : mapCreation(row);
  }

  /** Lists unresolved work for one project, including after restart. */
  async list(projectId: string): Promise<OpenCodexWorkspaceCreation[]> {
    const rows = this.database.prepare(`SELECT ${columns} FROM workspace_creations WHERE project_id = ? ORDER BY id`)
      .all(projectId) as CreationRow[];
    return rows.map(mapCreation);
  }

  /** Freezes the expected Git result before the mutation is dispatched. */
  async submitting(id: string, head: string, branch: string | null): Promise<void> {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(head)) {
      throw new Error("A complete Git commit id is required before creation.");
    }
    const result = this.database.prepare(`UPDATE workspace_creations
      SET state = 'submitting', expected_head = ?, expected_branch = ? WHERE id = ? AND state = 'preparing'`)
      .run(head, branch, id);
    if (result.changes !== 1) {
      throw new Error("Creation is not ready for dispatch.");
    }
  }

  /** Records command completion independently of listing and cache publication. */
  async confirmGit(id: string): Promise<void> {
    const result = this.database.prepare(`UPDATE workspace_creations SET git_confirmed = 1
      WHERE id = ? AND state = 'submitting'`).run(id);
    if (result.changes !== 1) {
      throw new Error("Creation is not awaiting Git completion.");
    }
  }

  /** Cancels preparation only; dispatched failures retain their repository lock. */
  async fail(id: string): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM workspace_creations WHERE id = ? AND state = 'preparing'").run(id);
      this.database.prepare("UPDATE workspace_creations SET state = 'uncertain' WHERE id = ?").run(id);
    })();
  }

  /** Publishes a verified, confirmed checkout and releases its journal in one transaction. */
  async commit(id: string): Promise<string> {
    return this.database.transaction(() => {
      const creation = this.require(id);
      if (!creation.gitConfirmed) {
        throw new Error("Git completion has not been confirmed.");
      }
      this.database.prepare("DELETE FROM workspace_creations WHERE id = ?").run(id);
      this.database.prepare(`INSERT INTO project_workspaces
        (id, project_id, source_id, source_key, path, name, is_primary, managed)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1)`)
        .run(creation.workspaceId, creation.projectId, creation.sourceId, creation.sourceId,
          creation.destinationPath, creation.name ?? defaultWorkspaceName(creation.destinationPath));
      return creation.workspaceId;
    })();
  }

  /** Requires the durable identity rather than recreating missing intent. */
  private require(id: string): OpenCodexWorkspaceCreation {
    const row = this.database.prepare(`SELECT ${columns} FROM workspace_creations WHERE id = ?`).get(id) as
      CreationRow | undefined;
    if (row === undefined) {
      throw new Error("Workspace creation does not exist.");
    }
    return mapCreation(row);
  }
}

/** Converts a trusted cache row to its plain protocol representation. */
function mapCreation(row: CreationRow): OpenCodexWorkspaceCreation {
  const { startJson, gitConfirmed, ...fields } = row;
  return { ...fields, start: JSON.parse(startJson), gitConfirmed: gitConfirmed === 1 };
}
