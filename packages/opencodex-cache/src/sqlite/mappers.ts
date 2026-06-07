/**
 * Maps internal SQLite rows to public cache types.
 */
import type {
  CachedProject,
  CachedProjectCommand,
  CachedProjectTask,
  CachedSource,
  CachedLogEntry,
  CachedThreadSummary,
  CachedThreadSyncState,
  CachedThreadTokenUsage
} from "../types.js";
import { parseProjectPreferences } from "./projectPreferences.js";
import { parseLocalSourceSettings } from "./sourceSettings.js";
import type { LogRow, ProjectCommandRow, ProjectRow, ProjectTaskRow, SourceRow, ThreadRow } from "./rowTypes.js";

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
    updatedAt: row.updated_at,
    isArchived: row.is_archived === 1
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
    preferences: parseProjectPreferences(row.preferences_json),
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
    lastDetectedCodexVersion: row.last_detected_codex_version,
    lastDetectedCodexAt: row.last_detected_codex_at,
    lastDetectionError: row.last_detection_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps a raw SQLite log row into the public cached log shape.
 *
 * @param row Log row read from SQLite.
 * @returns Normalized cached log entry.
 */
export function mapLogRow(row: LogRow): CachedLogEntry {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    details: parseLogDetails(row.details_json),
    createdAt: row.created_at
  };
}

/**
 * Maps a raw SQLite project command row into the public cache shape.
 *
 * @param row Command row read from SQLite.
 * @returns Normalized project command.
 */
export function mapProjectCommandRow(row: ProjectCommandRow): CachedProjectCommand {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    command: row.command,
    allowParallel: row.allow_parallel === 1,
    persistLogs: row.persist_logs === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps a raw SQLite project task row into the public cache shape.
 *
 * @param row Task row read from SQLite.
 * @returns Normalized project task.
 */
export function mapProjectTaskRow(row: ProjectTaskRow): CachedProjectTask {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
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
 * Maps cached thread token usage JSON into the public cache shape.
 *
 * @param row Joined thread row containing token usage JSON.
 * @returns Token usage snapshot, or `null`.
 */
export function mapThreadTokenUsage(row: ThreadRow): CachedThreadTokenUsage | null {
  if (row.token_usage_json === null || row.token_usage_json.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(row.token_usage_json) as CachedThreadTokenUsage;
  } catch {
    return null;
  }
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

function parseLogDetails(value: string | null): unknown {
  if (value === null || value.length === 0) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
