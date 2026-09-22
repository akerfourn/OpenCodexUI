import type { RootStore } from "../RootStore";
import type { ProjectStore } from "../project/ProjectStore";
import { parseFileLink, relativeWorkspacePath } from "./fileLinkTarget";

/** Routes project file references using the caller's source/workspace and the saved preference. */
export function openApplicationLink(
  root: RootStore,
  href: string,
  project: ProjectStore | null,
  workspacePath?: string | null,
  sourceId?: string | null
): void {
  const trimmed = href.trim();
  if (trimmed.length === 0) return;
  const contextPath = workspacePath === undefined ? project?.workspacePath ?? null : workspacePath;
  const contextSource = sourceId === undefined ? project?.project.sourceId ?? null : sourceId;
  const location = parseFileLink(trimmed);
  if (root.settings.fileOpeningMode !== "external" && location !== null && project !== null) {
    const workspace = project.workspaces.workspaces.find(value =>
      value.path === contextPath && value.sourceId === contextSource);
    if (workspace !== undefined && contextSource !== null) {
      const relative = relativeWorkspacePath(location.path, workspace.path);
      if (relative !== null) {
        const position = location.line === undefined ? undefined : {
          line: location.line, column: location.column
        };
        void project.files.open({
          sourceId: contextSource,
          projectId: project.project.id,
          workspaceId: workspace.id,
          workspacePath: workspace.path,
          path: relative
        }, workspace.name ?? workspace.path, position);
        return;
      }
    }
  }
  // Web links, files outside the workspace, and explicit external preferences
  // retain the source's opener. No host-path conversion takes place in the UI.
  void root.request({ type: "system.openLink", href: trimmed,
    projectPath: contextPath, sourceId: contextSource });
}
