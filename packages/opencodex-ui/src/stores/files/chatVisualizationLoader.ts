import type {
  OpenCodexFileContext,
  OpenCodexFileResult,
  OpenCodexFileSnapshot,
  OpenCodexProjectWorkspace
} from "@open-codex-ui/opencodex-protocol";
import type { FileRequestPort } from "./FileDocument";
import { parseFileLink, relativeWorkspacePath } from "./fileLinkTarget";

export interface ChatVisualizationWorkspace extends Omit<OpenCodexFileContext, "workspaceId"> {
  workspaceId: string | null;
}

/** Captures a conversation's workspace and lazily resolves its identity if the catalogue is still empty. */
export function createChatVisualizationLoader(
  port: FileRequestPort,
  workspace: ChatVisualizationWorkspace | null
): (path: string) => Promise<string | null> {
  let pendingWorkspaceId: Promise<string | null> | undefined;

  /** Reads standalone HTML through the source-owned workspace boundary. */
  return async function readVisualization(reference: string): Promise<string | null> {
    if (workspace === null) return null;
    const sourcePath = readVisualizationFilePath(reference);
    if (sourcePath === null) return null;
    const path = relativeWorkspacePath(sourcePath, workspace.workspacePath);
    if (path === null) return null;

    const workspaceId = workspace.workspaceId ?? await (pendingWorkspaceId ??= findWorkspaceId(port, workspace)
      .then((id) => {
        if (id === null) pendingWorkspaceId = undefined;
        return id;
      }, (error: unknown) => {
        pendingWorkspaceId = undefined;
        throw error;
      }));
    if (workspaceId === null) return null;
    const result = await port.request<OpenCodexFileResult<OpenCodexFileSnapshot>>({
      type: "workspaceFiles.read",
      target: { ...workspace, workspaceId, path }
    });
    if (!result.ok || new TextEncoder().encode(result.value.content).byteLength > 1024 * 1024) return null;
    return result.value.content;
  };
}

/** Accepts HTML file references without web schemes, control characters or line selectors. */
export function readVisualizationFilePath(reference: string): string | null {
  const location = parseFileLink(reference);
  if (location === null || location.line !== undefined || !/\.html?$/iu.test(location.path)
    || /[\u0000-\u001f\u007f]/u.test(reference) || /[\u0000-\u001f\u007f]/u.test(location.path)) return null;
  return location.path;
}

/** Finds the registered workspace without assuming the chat belongs to the active selection. */
async function findWorkspaceId(port: FileRequestPort, workspace: ChatVisualizationWorkspace): Promise<string | null> {
  const available = await port.request<OpenCodexProjectWorkspace[]>({
    type: "projectWorkspaces.list",
    projectId: workspace.projectId
  });
  const match = available.find((item) =>
    item.path === workspace.workspacePath && item.sourceId === workspace.sourceId && item.removedAt === null);
  return match?.id ?? null;
}
