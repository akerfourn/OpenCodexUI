/**
 * Maps internal SQLite rows to public cache types.
 */
import type {
  CachedProject,
  CachedSource,
  CachedThreadSummary,
  CachedThreadSyncState
} from "../types.js";
import { parseLocalSourceSettings } from "./sourceSettings.js";
import type { ProjectRow, SourceRow, ThreadRow } from "./rowTypes.js";

/**
 * Maps a raw SQLite thread row into the public cached thread summary shape.
 *
 * @param row Joined thread row read from SQLite.
 * @returns Normalized cached thread summary.
 */
export function mapThreadRow(row: ThreadRow): CachedThreadSummary {
  const projectName = row.project_display_name ?? row.project_default_name;
  const title = resolveCachedThreadTitle(row.codex_title, row.custom_title, row.preview ?? "");
  const thread: CachedThreadSummary = {
    id: row.id,
    sourceId: row.source_id,
    codexTitle: row.codex_title,
    customTitle: row.custom_title,
    title,
    preview: row.preview ?? "",
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    projectName,
    projectPath: row.cwd,
    branchName: row.branch_name,
    updatedAt: row.updated_at
  };

  if (row.status !== null) {
    thread.status = row.status;
  }

  return thread;
}

/**
 * Maps a raw SQLite project row into the public cached project shape.
 *
 * @param row Project row read from SQLite.
 * @returns Normalized cached project entry.
 */
export function mapProjectRow(row: ProjectRow): CachedProject {
  return {
    id: row.id,
    sourceId: row.source_id,
    path: row.path,
    defaultName: row.default_name,
    displayName: row.display_name,
    isHidden: row.is_hidden === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    editedAt: row.edited_at
  };
}

/**
 * Maps a raw SQLite source row into the public cached source shape.
 *
 * @param row Source row read from SQLite.
 * @returns Normalized cached source entry.
 */
export function mapSourceRow(row: SourceRow): CachedSource {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    settings: parseLocalSourceSettings(row.settings),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps SQLite sync-state columns into the cache sync-state shape.
 *
 * @param row Joined thread row containing sync-state columns.
 * @returns Normalized sync-state snapshot.
 */
export function mapSyncState(row: ThreadRow): CachedThreadSyncState {
  return {
    threadId: row.id,
    newestTurnId: row.newest_turn_id,
    oldestTurnId: row.oldest_turn_id,
    olderCursor: row.older_cursor,
    hasLoadedLatest: row.has_loaded_latest === 1,
    hasLoadedAllOlderTurns: row.has_loaded_all_older_turns === 1,
    lastSyncedAt: row.last_synced_at
  };
}

/**
 * Creates an empty sync-state snapshot for an unknown thread.
 *
 * @param threadId Identifier of the thread being initialized.
 * @returns Sync-state object with default empty values.
 */
export function createEmptySyncState(threadId: string): CachedThreadSyncState {
  return {
    threadId,
    newestTurnId: null,
    oldestTurnId: null,
    olderCursor: null,
    hasLoadedLatest: false,
    hasLoadedAllOlderTurns: false,
    lastSyncedAt: null
  };
}

/**
 * Resolves the effective thread title stored in the cache.
 *
 * @param codexTitle Title reported by Codex.
 * @param customTitle User-defined thread title.
 * @param preview Fallback preview text from the thread.
 * @returns Effective title shown by the application.
 */
function resolveCachedThreadTitle(
  codexTitle: string,
  customTitle: string | null,
  preview: string
): string {
  const trimmedCustomTitle = customTitle?.trim() ?? "";
  const trimmedCodexTitle = codexTitle.trim();

  if (trimmedCustomTitle.length > 0) {
    return trimmedCustomTitle;
  }

  if (trimmedCodexTitle.length > 0) {
    return trimmedCodexTitle;
  }

  return preview;
}

