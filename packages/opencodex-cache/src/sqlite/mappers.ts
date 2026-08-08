/**
 * Maps internal SQLite rows to public cache types.
 */
import type { OpenCodexSubAgentSource } from "@open-codex-ui/opencodex-protocol";

import type {
  CachedProject,
  CachedProjectGroup,
  CachedProjectTreeItem,
  CachedProjectCommand,
  CachedProjectCommandRule,
  CachedProjectCommandRuleFileState,
  CachedProjectTask,
  CachedSource,
  CachedLogEntry,
  CachedThreadSummary,
  CachedThreadSyncState,
  CachedThreadTokenUsage
} from "../types.js";
import { parseProjectPreferences } from "./projectPreferences.js";
import { normalizeSourceColor, parseSourceSettings } from "./sourceSettings.js";
import type {
  LogRow,
  ProjectCommandRow,
  ProjectCommandRuleFileStateRow,
  ProjectCommandRuleRow,
  ProjectRow,
  ProjectGroupRow,
  ProjectTreeItemRow,
  ProjectTaskRow,
  SourceRow,
  ThreadRow
} from "./rowTypes.js";

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
    sessionId: row.session_id,
    parentThreadId: row.parent_thread_id,
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
    isArchived: row.is_archived === 1,
    threadSource: row.thread_source,
    agentNickname: row.agent_nickname,
    agentRole: row.agent_role,
    subAgentSource: parseSubAgentSource(row.sub_agent_source_json),
    canAcceptDirectInput: null
  };

  if (row.status !== null) {
    thread.status = row.status;
  }

  return thread;
}

/**
 * Parses persisted structured sub-agent source metadata.
 *
 * @param value Serialized source metadata.
 * @returns Parsed metadata, or `null` when absent or invalid.
 */
function parseSubAgentSource(value: string | null): OpenCodexSubAgentSource | null {
  if (value === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<OpenCodexSubAgentSource>;

    if (
      parsed.kind !== "review"
      && parsed.kind !== "compact"
      && parsed.kind !== "threadSpawn"
      && parsed.kind !== "memoryConsolidation"
      && parsed.kind !== "other"
    ) {
      return null;
    }

    return {
      kind: parsed.kind,
      parentThreadId: typeof parsed.parentThreadId === "string" ? parsed.parentThreadId : null,
      depth: typeof parsed.depth === "number" ? parsed.depth : null,
      agentPath: typeof parsed.agentPath === "string" ? parsed.agentPath : null,
      agentNickname: typeof parsed.agentNickname === "string" ? parsed.agentNickname : null,
      agentRole: typeof parsed.agentRole === "string" ? parsed.agentRole : null,
      label: typeof parsed.label === "string" ? parsed.label : null
    };
  } catch {
    return null;
  }
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

/** Maps one project group row into the public cache shape. */
export function mapProjectGroupRow(row: ProjectGroupRow): CachedProjectGroup {
  return {
    id: row.id,
    name: row.name,
    color: normalizeSourceColor(row.color),
    isCollapsed: row.is_collapsed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Maps one project tree row into the public cache shape. */
export function mapProjectTreeItemRow(row: ProjectTreeItemRow): CachedProjectTreeItem {
  if (row.item_type === "group" && row.group_id !== null) {
    return {
      type: "group",
      groupId: row.group_id,
      parentGroupId: row.parent_group_id,
      sortOrder: row.sort_order
    };
  }

  if (row.item_type === "project" && row.project_id !== null) {
    return {
      type: "project",
      projectId: row.project_id,
      parentGroupId: row.parent_group_id,
      sortOrder: row.sort_order
    };
  }

  throw new Error("Invalid project tree item row.");
}

/**
 * Maps a raw SQLite source row into the public cached source shape.
 *
 * @param row Source row read from SQLite.
 * @returns Normalized cached source entry.
 */
export function mapSourceRow(row: SourceRow): CachedSource {
  const base = {
    id: row.id,
    name: row.name,
    lastDetectedCodexVersion: row.last_detected_codex_version,
    lastDetectedCodexAt: row.last_detected_codex_at,
    lastDetectionError: row.last_detection_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  const settings = parseSourceSettings(row.kind, row.settings);

  switch (row.kind) {
    case "custom":
      return { ...base, kind: "custom", settings: settings as Extract<CachedSource, { kind: "custom" }>["settings"] };
    case "wsl":
      return { ...base, kind: "wsl", settings: settings as Extract<CachedSource, { kind: "wsl" }>["settings"] };
    case "ssh":
      return { ...base, kind: "ssh", settings: settings as Extract<CachedSource, { kind: "ssh" }>["settings"] };
    default:
      return { ...base, kind: "local", settings: settings as Extract<CachedSource, { kind: "local" }>["settings"] };
  }
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
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps a raw SQLite project rule row into the public cached rule shape.
 *
 * @param row Rule row read from SQLite.
 * @returns Normalized cached rule.
 */
export function mapProjectCommandRuleRow(row: ProjectCommandRuleRow): CachedProjectCommandRule {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    pattern: parseStringArray(row.pattern_json),
    decision: row.decision,
    justification: row.justification,
    matchExamples: parseStringArray(row.match_examples_json),
    notMatchExamples: parseStringArray(row.not_match_examples_json),
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Maps generated-file synchronization metadata into the cache shape.
 *
 * @param row File-state row read from SQLite.
 * @returns Normalized generated-file state.
 */
export function mapProjectCommandRuleFileStateRow(
  row: ProjectCommandRuleFileStateRow
): CachedProjectCommandRuleFileState {
  return {
    projectId: row.project_id,
    generatedHash: row.generated_hash,
    generatedPath: row.generated_path,
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

/**
 * Parses structured log details from their SQLite representation.
 *
 * @param value Serialized details payload.
 * @returns Parsed details, raw text when parsing fails, or `null`.
 */
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

/**
 * Parses a serialized string array without allowing malformed cache data to
 * escape into the public repository contract.
 *
 * @param value Serialized string array.
 * @returns Parsed strings, or an empty array when invalid.
 */
function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}
