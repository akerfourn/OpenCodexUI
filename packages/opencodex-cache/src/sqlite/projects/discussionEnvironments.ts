import type { Database } from "better-sqlite3";
import type { CachedProject } from "../../types/projects.js";
import { mapProjectRow } from "../shared/mappers.js";
import type { ProjectRow } from "../shared/rowTypes.js";
import { resolveProject } from "./projectResolver.js";

/** Allocates a conversation-owned execution context without adding a Home project or tree item. */
export async function createDiscussionEnvironment(
  database: Database, path: string, sourceId: string, key: string
): Promise<CachedProject> {
  return database.transaction(() => {
    const previous = database.prepare("SELECT * FROM projects WHERE discussion_key = ?")
      .get(key) as ProjectRow | undefined;
    if (previous !== undefined) {
      if (previous.discussion_creation_cancelled === 1) {
        throw new Error("This discussion setup has been cancelled. Start a new discussion instead.");
      }
      if (previous.source_id !== sourceId || previous.path !== path) {
        throw new Error("Discussion draft belongs to another source or working directory.");
      }
      return mapProjectRow({ ...previous, edited_at: previous.updated_at });
    }
    const context = resolveProject(database, path, sourceId, null, false, "discussion");
    if (context === null) throw new Error("Discussion directory must be absolute.");
    const row = database.prepare("SELECT * FROM projects WHERE id = ?")
      .get(context.id) as ProjectRow & { discussion_key: string | null };
    if (row.kind !== "discussion") {
      throw new Error("A project already owns the requested discussion directory.");
    }
    if (row.discussion_key !== null && row.discussion_key !== key) {
      throw new Error("Discussion directory already belongs to another draft.");
    }
    database.prepare("UPDATE projects SET discussion_key = ? WHERE id = ?").run(key, row.id);
    return mapProjectRow({ ...row, edited_at: row.updated_at });
  })();
}

/** Cancels local identity allocation without deleting an unknown native thread or any directory. */
export async function cancelDiscussionCreation(
  database: Database, environmentId: string, sourceId: string | null
): Promise<void> {
  database.transaction(() => {
    const environment = database.prepare("SELECT * FROM projects WHERE id = ? AND kind = 'discussion'")
      .get(environmentId) as ProjectRow | undefined;
    if (environment === undefined || environment.source_id !== sourceId) {
      throw new Error("Discussion setup does not belong to the requested source.");
    }
    if (environment.discussion_thread_id != null) {
      throw new Error("This discussion already has a native identity; use its conversation actions instead.");
    }
    if (database.prepare(`SELECT id FROM workspace_execution_reservations
      WHERE project_id = ? AND (thread_id IS NOT NULL OR operation <> 'turn')`).get(environmentId) !== undefined) {
      throw new Error("A bound execution must be reconciled before abandoning discussion setup.");
    }
    // thread/start only allocates an identity. No user turn can be dispatched before that identity
    // is received and bound; abandoning these unbound intents never stops or deletes native work.
    database.prepare("DELETE FROM workspace_execution_reservations WHERE project_id = ?").run(environmentId);
    database.prepare("UPDATE projects SET discussion_creation_cancelled = 1 WHERE id = ?").run(environmentId);
  })();
}

/** Confirms a persisted source-owned native identity without making deleted chats creatable again. */
export async function completeDiscussionCreation(
  database: Database, environmentId: string, sourceId: string, threadId: string
): Promise<void> {
  const result = database.prepare(`UPDATE projects SET discussion_thread_id = @threadId
    WHERE id = @environmentId AND source_id = @sourceId AND kind = 'discussion'
      AND discussion_creation_cancelled = 0
      AND (discussion_thread_id IS NULL OR discussion_thread_id = @threadId)
      AND EXISTS (SELECT 1 FROM threads WHERE id = @threadId
        AND project_id = @environmentId AND source_id = @sourceId AND parent_thread_id IS NULL)`)
    .run({ environmentId, sourceId, threadId });
  if (result.changes !== 1) throw new Error("Native discussion identity does not match its execution context.");
}
