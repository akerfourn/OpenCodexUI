/**
 * Internal SQLite row shapes used by cache queries and mappers.
 */
import type { CachedCommandRuleDecision, CachedSourceKind } from "../types.js";

/**
 * Joined SQLite row used to map cached thread summaries and sync state.
 */
export type ThreadRow = {
  id: string;
  session_id: string | null;
  parent_thread_id: string | null;
  source_id: string | null;
  cwd: string | null;
  project_default_name: string | null;
  project_display_name: string | null;
  branch_name: string | null;
  codex_title: string;
  custom_title: string | null;
  title: string;
  preview: string | null;
  model: string | null;
  reasoning_effort: string | null;
  status: string | null;
  updated_at: string | null;
  newest_turn_id: string | null;
  oldest_turn_id: string | null;
  older_cursor: string | null;
  has_loaded_latest: number;
  has_loaded_all_older_turns: number;
  last_synced_at: string | null;
  token_usage_json: string | null;
  is_archived: number;
  thread_source: string | null;
  agent_nickname: string | null;
  agent_role: string | null;
};

/**
 * SQLite row containing one serialized raw Codex turn.
 */
export type TurnRow = {
  id: string;
  raw_json: string;
};

/**
 * Joined SQLite row used to map cached projects.
 */
export type ProjectRow = {
  id: string;
  source_id: string | null;
  source_key: string;
  path: string;
  default_name: string;
  display_name: string | null;
  is_hidden: number;
  preferences_json: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  edited_at: string;
};

/** SQLite row containing one OpenCodexUI-only project group. */
export type ProjectGroupRow = {
  id: string;
  name: string;
  color: string;
  is_collapsed: number;
  created_at: string;
  updated_at: string;
};

/** SQLite row containing one ordered project tree node. */
export type ProjectTreeItemRow = {
  item_type: "group" | "project";
  group_id: string | null;
  project_id: string | null;
  parent_group_id: string | null;
  sort_order: number;
};

/**
 * SQLite row used to map application logs.
 */
export type LogRow = {
  id: string;
  type: "error" | "warning" | "info";
  message: string;
  details_json: string | null;
  created_at: string;
};

/**
 * SQLite row containing one source-scoped model catalog.
 */
export type ModelCatalogRow = {
  source_id: string;
  models_json: string;
  updated_at: string;
};

/**
 * SQLite row used to map project-local commands.
 */
export type ProjectCommandRow = {
  id: string;
  project_id: string;
  name: string;
  command: string;
  allow_parallel: number;
  persist_logs: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/**
 * SQLite row used to map a project command authorization rule.
 */
export type ProjectCommandRuleRow = {
  id: string;
  project_id: string;
  name: string;
  pattern_json: string;
  decision: CachedCommandRuleDecision;
  justification: string | null;
  match_examples_json: string;
  not_match_examples_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

/**
 * SQLite row used to persist generated project rule file metadata.
 */
export type ProjectCommandRuleFileStateRow = {
  project_id: string;
  generated_hash: string | null;
  generated_path: string | null;
  updated_at: string;
};

/**
 * SQLite row used to map project-local tasks.
 */
export type ProjectTaskRow = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: "todo" | "inProgress" | "toValidate" | "done";
  created_at: string;
  updated_at: string;
};

/**
 * SQLite row used to map Codex sources.
 */
export type SourceRow = {
  id: string;
  kind: CachedSourceKind;
  name: string;
  settings: string;
  last_detected_codex_version: string | null;
  last_detected_codex_at: string | null;
  last_detection_error: string | null;
  created_at: string;
  updated_at: string;
};
