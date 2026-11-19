import { useApplicationErrorReporter } from "../app/applicationErrorContext";
import { useEffect, useState } from "react";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceRemovalInspection } from "@open-codex-ui/opencodex-protocol";
import type { ProjectWorkspacesStore } from "../../stores/project/ProjectWorkspacesStore";

/** Source inspection and file-loss consent scoped to the displayed workspace. */
export interface WorkspaceRemovalInspectionState {
  result: OpenCodexWorkspaceRemovalInspection | null;
  error: string | null;
  loading: boolean;
  force: boolean;
  setForce(force: boolean): void;
  refresh(): void;
}

/** Ignores stale source replies and requires renewed force consent after an explicit refresh. */
export function useWorkspaceRemovalInspection(store: ProjectWorkspacesStore,
  target: Pick<OpenCodexProjectWorkspace, "id" | "projectId" | "sourceId" | "path">,
  enabled: boolean): WorkspaceRemovalInspectionState {
  const reportError = useApplicationErrorReporter();
  const [result, setResult] = useState<OpenCodexWorkspaceRemovalInspection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [revision, setRevision] = useState(0);
  const [force, setForce] = useState(false);
  const { id, projectId, sourceId, path } = target;

  useEffect(() => {
    let active = true;
    setResult(null);
    setError(null);
    setForce(false);
    setLoading(enabled);
    if (!enabled) return;
    /** Validates every reply against the exact workspace displayed in the confirmation. */
    async function inspect(): Promise<void> {
      try {
        const value = await store.inspectRemoval(id);
        if (value?.workspaceId !== id || value.projectId !== projectId || value.sourceId !== sourceId
          || value.workspacePath !== path) throw new Error("Workspace inspection identity changed. Refresh before deleting it.");
        if (active) setResult(value);
      } catch (failure) {
        if (active) {
          setError(failure instanceof Error ? failure.message : String(failure));
          reportError(failure);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void inspect();
    return () => { active = false; };
  }, [store, id, projectId, sourceId, path, enabled, revision, reportError]);

  /** Clears old consent immediately rather than letting a stale inspection authorize removal. */
  function refresh(): void { setForce(false); setResult(null); setLoading(true); setRevision(value => value + 1); }
  return { result, error, loading, force, setForce, refresh };
}
