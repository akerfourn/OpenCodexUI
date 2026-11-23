import type { CachedProject, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";

/** Resolves an explicit context for shared tools without exposing personal chats in project lists. */
export async function readExecutionEnvironment(
  cache: Pick<OpenCodexCacheRepository, "listProjects" | "listDiscussionEnvironments">,
  id: string
): Promise<CachedProject | undefined> {
  const project = (await cache.listProjects()).find((item) => item.id === id);
  if (project !== undefined) return project;
  return (await cache.listDiscussionEnvironments()).find((item) => item.id === id);
}
