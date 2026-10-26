import path from "node:path";
import type { Database } from "better-sqlite3";
import type { WorkspaceMoveInput } from "../../types/workspaceMoves.js";

/** Checks the entire project catalogue and both endpoint subtrees inside the same SQLite transaction. */
export function validatePrimaryMoveMembers(database: Database, move: WorkspaceMoveInput): void {
  const snapshot = move.primarySnapshot;
  if (snapshot === undefined || typeof snapshot.identity !== "string" || snapshot.identity.length === 0
    || !Array.isArray(snapshot.members)) throw new Error("A complete primary move snapshot is required.");
  const rows = database.prepare(`SELECT id, project_id AS projectId, source_id AS sourceId, path
    FROM project_workspaces WHERE removed_at IS NULL`).all() as Array<{ id: string; projectId: string; sourceId: string | null; path: string }>;
  const members = rows.filter(row => row.projectId === move.projectId);
  if (members.length !== snapshot.members.length || new Set(snapshot.members.map(member => member.workspaceId)).size !== members.length) {
    throw new Error("Project workspace catalogue changed during movement.");
  }
  const syntax = move.workspacePath.startsWith("/") ? path.posix : path.win32;
  /** Tests physical containment in the owning source, without using the host OS syntax. */
  function contains(root: string, value: string): boolean {
    const relative = syntax.relative(root, value);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${syntax.sep}`) && !syntax.isAbsolute(relative));
  }
  for (const row of members) {
    const member = snapshot.members.find(item => item.workspaceId === row.id);
    const target = contains(move.workspacePath, row.path) ? syntax.join(move.destinationPath, syntax.relative(move.workspacePath, row.path)) : row.path;
    if (member === undefined || member.path !== row.path || member.destinationPath !== target || row.sourceId !== move.sourceId) {
      throw new Error("Project workspace context changed during movement.");
    }
  }
  for (const row of rows) {
    if (row.sourceId !== move.sourceId || row.projectId === move.projectId) continue;
    if (contains(move.workspacePath, row.path) || contains(row.path, move.workspacePath)
      || contains(move.destinationPath, row.path) || contains(row.path, move.destinationPath)) {
      throw new Error("Move paths overlap another project's workspace.");
    }
    if (snapshot.git?.checkouts.some(entry => contains(row.path, entry.path) || contains(entry.path, row.path))) {
      throw new Error("A repository checkout is owned by another project. Use manual movement and relocation.");
    }
  }
}
