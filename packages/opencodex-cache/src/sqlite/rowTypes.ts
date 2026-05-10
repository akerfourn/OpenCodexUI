/**
 * Internal SQLite row shapes used by cache queries and mappers.
 */
export type ThreadRow = {
  id: string;
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
  reasoning_effort: "low" | "medium" | "high" | "xhigh" | null;
  status: string | null;
  updated_at: string | null;
  newest_turn_id: string | null;
  oldest_turn_id: string | null;
  older_cursor: string | null;
  has_loaded_latest: number;
  has_loaded_all_older_turns: number;
  last_synced_at: string | null;
};

export type TurnRow = {
  id: string;
  raw_json: string;
};

export type ProjectRow = {
  id: string;
  source_id: string | null;
  path: string;
  default_name: string;
  display_name: string | null;
  is_hidden: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  edited_at: string;
};

export type SourceRow = {
  id: string;
  kind: "local";
  name: string;
  settings: string;
  created_at: string;
  updated_at: string;
};

