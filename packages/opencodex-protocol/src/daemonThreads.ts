import type { OpenCodexThread } from "./messages/threads.js";

/** Source filters supported by the local conversation catalog. */
export type OpenCodexThreadSourceKind =
  | "cli" | "vscode" | "exec" | "appServer" | "subAgent" | "subAgentReview"
  | "subAgentCompact" | "subAgentThreadSpawn" | "subAgentOther" | "unknown";

/** One page from the source bound to the daemon session. */
export interface DaemonThreadListInput {
  cursor?: string | null;
  pageSize?: number | null;
  sortBy?: "createdAt" | "updatedAt" | null;
  sortDirection?: "asc" | "desc" | null;
  workingDirectories?: string[] | null;
  sourceKinds?: OpenCodexThreadSourceKind[] | null;
  searchTerm?: string | null;
  archived?: boolean | null;
  parentThreadId?: string | null;
  ancestorThreadId?: string | null;
}

/** Source metadata before display formatting and project or cache enrichment. */
export type SourceThreadSummary = Pick<OpenCodexThread,
  "id" | "sessionId" | "parentThreadId" | "codexTitle" | "preview" | "projectPath"
  | "branchName" | "threadSource" | "agentNickname" | "agentRole" | "subAgentSource"
  | "canAcceptDirectInput"
> & { updatedAtUnixSeconds: number | null; status: string | null };

/** Both cursors are opaque and scoped to the source and query. */
export interface DaemonThreadListPage {
  threads: SourceThreadSummary[];
  nextCursor: string | null;
  backwardsCursor: string | null;
}
