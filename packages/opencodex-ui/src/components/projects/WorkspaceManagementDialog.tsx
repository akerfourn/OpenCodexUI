import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceWorkStatus } from "@open-codex-ui/opencodex-protocol";
import { defaultWorkspaceRetentionDays } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { matchingWorkspaceActivity, workspaceManagementStatus } from "../../stores/project/workspaceManagement";
import { WorkspaceManagementRowX } from "./WorkspaceManagementRow";
import { WorkspacePropertiesDialogX } from "./WorkspacePropertiesDialog";
import { WorkspaceRemoveDialogX } from "./WorkspaceRemoveDialog";
import { WorkspaceRetentionSettingsX } from "./WorkspaceRetentionSettings";

/** Reviews cached activity and advisory cleanup candidates without automatic deletion or recovery. */
export function WorkspaceManagementDialog({ project, onClose }: { project: ProjectStore; onClose(): void }) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const savedDays = project.project.preferences.workspaceRetention?.days;
  const retentionDays = savedDays === undefined ? defaultWorkspaceRetentionDays : savedDays;
  const [onlyCandidates, setOnlyCandidates] = useState(false);
  const [workStatusFilter, setWorkStatusFilter] = useState<"all" | OpenCodexWorkspaceWorkStatus>("all");
  const [now, setNow] = useState(Date.now);
  const [properties, setProperties] = useState<OpenCodexProjectWorkspace | null>(null);
  const [removing, setRemoving] = useState<OpenCodexProjectWorkspace | null>(null);
  // Tool activity is deliberately conservative across this project, including launches awaiting a response.
  const hasLocalActivity = project.hasRunningChatIndicator || project.commandsStore.hasActiveRun
    || project.hasActiveDebugSession || project.composeStore.hasNonStoppedContainer
    || project.composeStore.pendingServiceNames.size > 0;
  const busy = store.isBusy || store.isRefreshingManagement;
  useEffect(() => { void store.refreshManagement(); }, [store]);
  // Also handles reopening the view while an earlier bounded refresh is still running.
  useEffect(() => {
    if (!store.isRefreshingManagement) setNow(Date.now());
  }, [store, store.isRefreshingManagement]);

  /** Refreshes the cached evidence and native lock snapshots explicitly. */
  async function handleRefresh(): Promise<void> {
    await store.refreshManagement();
    setNow(Date.now());
  }
  /** Rechecks activity after a metadata edit or successful removal. */
  function handleCloseProperties(): void { setProperties(null); void handleRefresh(); }
  /** Rechecks the retained catalogue instead of hiding an uncertain deletion. */
  function handleCloseRemoval(): void { setRemoving(null); void handleRefresh(); }
  /** Persists a user declaration while retaining the current inventory and cleanup guards. */
  async function handleWorkStatus(workspace: OpenCodexProjectWorkspace, status: OpenCodexWorkspaceWorkStatus): Promise<void> {
    await store.setWorkStatus(workspace, status);
    setNow(Date.now());
  }
  const entries = store.workspaces.map(workspace => ({ workspace,
    changes: store.changes.resultFor(workspace), changesError: store.changes.errorFor(workspace),
    activity: matchingWorkspaceActivity(workspace, store.activityById.get(workspace.id)), status: workspaceManagementStatus({
      workspace, activity: store.activityById.get(workspace.id), lock: store.lockStates.get(workspace.id),
      changes: store.changes.resultFor(workspace),
      hasLocalActivity, hasUnsavedDocuments: project.files.hasUnsavedWorkspaceDocuments(workspace.id),
      sourceAvailable: project.isCodexSourceReady && !project.isReadOnlyFromCache && workspace.sourceId === project.project.sourceId,
      checking: store.isRefreshingManagement || store.loadingLockIds.has(workspace.id), retentionDays, now
    }) }));
  const filtered = entries.filter(entry => workStatusFilter === "all"
    || (!entry.workspace.isPrimary && (entry.workspace.workStatus ?? "active") === workStatusFilter));
  const visible = filtered.filter(entry => !onlyCandidates || entry.status === "candidate");
  const candidateCount = filtered.filter(entry => entry.status === "candidate").length;
  const rows = visible.map(entry => <WorkspaceManagementRowX key={entry.workspace.id} {...entry}
    disabled={busy} workStatusDisabled={busy} diskUsage={store.diskUsage}
    onWorkStatus={handleWorkStatus} onProperties={setProperties} onRemove={setRemoving} />);
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const loading = store.isRefreshingManagement ? <CircularProgress size={20} aria-label={t("workspaceManagement.refresh")} /> : null;
  const empty = visible.length === 0 && !store.isRefreshingManagement
    ? <Typography color="text.secondary">{t("workspaceManagement.empty")}</Typography> : null;
  const propertiesDialog = properties === null ? null : <WorkspacePropertiesDialogX project={project}
    workspace={properties} onClose={handleCloseProperties} />;
  const removeDialog = removing === null ? null : <WorkspaceRemoveDialogX project={project}
    workspace={removing} onClose={handleCloseRemoval} />;

  return <Dialog open fullWidth maxWidth="md" onClose={store.isBusy ? undefined : onClose}>
    <DialogTitle>{t("workspaceManagement.title")}</DialogTitle>
    <DialogContent>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">{t("workspaceManagement.help")}</Alert>
        <Typography variant="body2" color="text.secondary">{t("workspaceDiskUsage.help")}</Typography>
        <Typography variant="body2" color="text.secondary">{t("workspaceWorkStatus.help")}</Typography>
        <TextField select label={t("workspaceWorkStatus.filter")} value={workStatusFilter}
          onChange={event => setWorkStatusFilter(event.target.value as "all" | OpenCodexWorkspaceWorkStatus)} disabled={busy}>
          <MenuItem value="all">{t("workspaceWorkStatus.all")}</MenuItem>
          <MenuItem value="active">{t("workspaceWorkStatus.active")}</MenuItem>
          <MenuItem value="completed">{t("workspaceWorkStatus.completed")}</MenuItem>
        </TextField>
        <WorkspaceRetentionSettingsX project={project} disabled={busy} />
        <FormControlLabel control={<Checkbox checked={onlyCandidates} onChange={event => setOnlyCandidates(event.target.checked)} />}
          label={t("workspaceManagement.onlyCandidates")} />
        <Typography variant="body2">{t("workspaceManagement.candidates", { count: candidateCount })}</Typography>
        {loading}{error}{rows}{empty}
      </Stack>
      {propertiesDialog}{removeDialog}
    </DialogContent>
    <DialogActions>
      <Button disabled={busy} onClick={handleRefresh}>{t("workspaceManagement.refresh")}</Button>
      <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
    </DialogActions>
  </Dialog>;
}
export const WorkspaceManagementDialogX = observer(WorkspaceManagementDialog);
