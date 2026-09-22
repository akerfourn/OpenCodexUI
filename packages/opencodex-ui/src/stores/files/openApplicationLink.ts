import type { OpenCodexFileResult, OpenCodexFileEntry } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "../project/ProjectStore";
import { parseFileLink, relativeWorkspacePath } from "./fileLinkTarget";

/** Discards older inspections when another link is selected in the same project. */
const requests = new WeakMap<ProjectStore, number>();

/** Routes project file references using the caller's source/workspace and the saved preference. */
export async function openApplicationLink(
  root: RootStore,
  href: string,
  project: ProjectStore | null,
  workspacePath?: string | null,
  sourceId?: string | null
): Promise<void> {
  const trimmed = href.trim();
  if (trimmed.length === 0) return;
  const contextPath = workspacePath === undefined ? project?.workspacePath ?? null : workspacePath;
  const contextSource = sourceId === undefined ? project?.project.sourceId ?? null : sourceId;
  const generation = (project === null ? 0 : requests.get(project) ?? 0) + 1;
  if (project !== null) requests.set(project, generation);
  const location = parseFileLink(trimmed);
  if (root.settings.fileOpeningMode !== "external" && location !== null && project !== null) {
    const workspace = project.workspaces.workspaces.find(value =>
      value.path === contextPath && value.sourceId === contextSource);
    if (workspace !== undefined && contextSource !== null) {
      const relative = relativeWorkspacePath(location.path, workspace.path, true);
      if (relative !== null) {
        const position = location.line === undefined ? undefined : {
          line: location.line, column: location.column
        };
        const target = {
          sourceId: contextSource,
          projectId: project.project.id,
          workspaceId: workspace.id,
          workspacePath: workspace.path,
          path: relative
        };
        let info: OpenCodexFileResult<Pick<OpenCodexFileEntry, "kind">>;
        try {
          info = await root.request({ type: "workspaceFiles.stat", target });
        } catch (error) {
          // The document reader retains the existing visible source-error feedback.
          info = { ok: false, code: "unavailable", details: String(error) };
        }
        if (requests.get(project) !== generation || project.files.isDisposed) return;
        if (info.ok && info.value.kind === "directory") {
          await root.request({ type: "system.openLink", href: trimmed,
            projectPath: contextPath, sourceId: contextSource });
        } else {
          await project.files.open(target, workspace.name ?? workspace.path, position);
        }
        return;
      }
    }
  }
  // Web links, files outside the workspace, and explicit external preferences
  // retain the source's opener. No host-path conversion takes place in the UI.
  await root.request({ type: "system.openLink", href: trimmed,
    projectPath: contextPath, sourceId: contextSource });
}
