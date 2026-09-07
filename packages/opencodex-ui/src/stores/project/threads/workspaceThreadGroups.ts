import type { OpenCodexProjectWorkspace, OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

/** One retained workspace and its visible conversations, in the existing list order. */
export interface WorkspaceThreadGroup {
  id: string;
  workspace: OpenCodexProjectWorkspace | null;
  path: string;
  threads: OpenCodexThread[];
}

/** Groups only matching source-local paths; unmatched cached conversations remain readable. */
export function groupWorkspaceThreads(workspaces: OpenCodexProjectWorkspace[], threads: OpenCodexThread[],
  sourceId: string | null): WorkspaceThreadGroup[] {
  const groups: WorkspaceThreadGroup[] = workspaces.map((workspace) => ({
    id: workspace.id, workspace, path: workspace.path, threads: []
  }));
  for (const thread of threads) {
    const threadSource = thread.sourceId === undefined ? sourceId : thread.sourceId;
    let group = groups.find((item) => item.workspace !== null
      && item.path === thread.projectPath && item.workspace.sourceId === threadSource
      && item.workspace.removedAt === null);
    if (group === undefined) {
      const id = JSON.stringify(["unavailable", threadSource, thread.projectPath]);
      group = groups.find((item) => item.id === id);
      if (group === undefined) {
        group = { id, workspace: null, path: thread.projectPath ?? "", threads: [] };
        groups.push(group);
      }
    }
    group.threads.push(thread);
  }
  return groups.filter((group) => group.workspace?.removedAt === null || group.threads.length > 0);
}

/** Keeps technical paths out of normal labels, including legacy unnamed workspaces. */
export function workspaceLabel(workspace: OpenCodexProjectWorkspace, primaryLabel: string): string {
  if (workspace.isPrimary) return primaryLabel;
  return workspace.name ?? workspace.path.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1) ?? workspace.path;
}
