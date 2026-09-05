import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { ThreadTurnCache } from "../../ThreadTurnCache.js";

/** Determines whether existing history requires a resume before a turn operation. */
export function shouldResumeThreadBeforeTurn(cache: Pick<ThreadTurnCache, "get">, threadId: string): boolean {
  const entry = cache.get(threadId);
  return entry === null || entry.turnsById.size > 0;
}

/** Resumes an existing thread using the established explicit-path/default-path policy. */
export async function resumeThreadForTurn(
  client: CodexAppServerClient,
  threadId: string,
  projectPath: string | null,
  defaultProjectPath: string | null | undefined,
  model: string | null
): Promise<void> {
  await client.resumeThread(threadId, {
    cwd: normalizeProjectPath(projectPath) ?? normalizeProjectPath(defaultProjectPath),
    excludeTurns: true,
    model
  });
}
