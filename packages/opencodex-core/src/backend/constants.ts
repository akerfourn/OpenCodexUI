/**
 * Shared backend constants and internal request parameter types.
 */
export const THREAD_LIST_PAGE_SIZE = 100;
export const THREAD_LIST_MAX_PAGES = 20;
export const THREAD_INITIAL_CACHED_TURNS = 10;
export const THREAD_TURNS_PAGE_SIZE = 20;
export const LEGACY_DEFAULT_SOURCE_ID = "default";

export type ThreadSourceKind =
  | "cli"
  | "vscode"
  | "exec"
  | "appServer"
  | "subAgent"
  | "subAgentReview"
  | "subAgentCompact"
  | "subAgentThreadSpawn"
  | "subAgentOther"
  | "unknown";

export type ThreadListParams = {
  cursor?: string | null;
  limit?: number | null;
  sortKey?: "created_at" | "updated_at" | null;
  sortDirection?: "asc" | "desc" | null;
  sourceKinds?: ThreadSourceKind[] | null;
  cwd?: string | string[] | null;
  searchTerm?: string | null;
};

export const THREAD_SOURCE_KINDS: ThreadSourceKind[] = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown"
];

