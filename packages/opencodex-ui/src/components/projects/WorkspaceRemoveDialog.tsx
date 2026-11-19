import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";
import { useWorkspaceRemovalInspection } from "./useWorkspaceRemovalInspection";
import { WorkspaceRemovalInspection } from "./WorkspaceRemovalInspection";

/** Names the exact checkout and requires explicit confirmation before irreversible file removal. */
export function WorkspaceRemoveDialog({ project, workspace, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; onClose(): void;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const [deferred, setDeferred] = useState(false);
  const store = project.workspaces;
  const current = store.workspaces.find(item => item.id === workspace.id) ?? workspace;
  const name = workspaceLabel(workspace, t("workspaces.primary"));
  const unsaved = project.files.hasUnsavedWorkspaceDocuments(workspace.id);
  const unavailable = project.isReadOnlyFromCache || workspace.isPrimary
    || !current.managed || current.removedAt !== null || current.removalPending === true || current.movePending === true
    || current.path !== workspace.path || current.sourceId !== workspace.sourceId;
  const inspection = useWorkspaceRemovalInspection(store, workspace, !unavailable);
  const blocked = store.isBusy || unsaved || unavailable || inspection.loading || inspection.result === null
    || (inspection.result.totalFileCount > 0 && !inspection.force);
  const unsavedNotice = unsaved ? <Alert severity="warning">{t("workspaces.removeUnsaved")}</Alert> : null;
  const deferredNotice = deferred ? <Alert severity="info">{t("workspaces.deferredRemovalHelp")}</Alert> : null;
  const actionLabel = deferred ? t("workspaces.scheduleRemoval") : t("workspaces.remove");

  /** Closes only after the backend and durable catalogue confirm successful removal. */
  async function handleRemove(): Promise<void> {
    if (blocked || confirmation !== name) return;
    if (inspection.force) await store.remove(workspace.id, deferred, true, workspace.path);
    else if (deferred) await store.remove(workspace.id, true);
    else await store.remove(workspace.id);
    if (store.error === null) onClose();
  }

  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("workspaces.removeTitle", { name })}</DialogTitle>
      <DialogContent>
        <Alert severity="warning">{t("workspaces.removeHelp")}</Alert>
        <TextField label={t("workspaces.destination")} value={workspace.path} fullWidth margin="normal"
          slotProps={{ input: { readOnly: true } }} />
        <WorkspaceRemovalInspection inspection={inspection} disabled={store.isBusy} />
        <FormControlLabel label={t("workspaces.deferRemoval")} control={
          <Checkbox checked={deferred} disabled={store.isBusy} onChange={event => setDeferred(event.target.checked)} />
        } />
        {deferredNotice}
        <TextField label={t("workspaces.removeConfirm", { name })} value={confirmation} fullWidth margin="normal"
          disabled={store.isBusy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
        {unsavedNotice}
      </DialogContent>
      <DialogActions>
        <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
        <Button color="error" disabled={blocked || confirmation !== name} onClick={handleRemove}>
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceRemoveDialogX = observer(WorkspaceRemoveDialog);
