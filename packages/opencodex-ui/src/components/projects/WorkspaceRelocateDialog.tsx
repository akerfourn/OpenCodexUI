import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";

/** Reconnects a manually moved directory with explicit identity confirmation. */
export function WorkspaceRelocateDialog({ project, workspace, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; onClose(): void;
}) {
  const { t } = useTranslation();
  const [destination, setDestination] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const store = project.workspaces;
  const current = store.workspaces.find(item => item.id === workspace.id) ?? workspace;
  const unsaved = project.files.hasUnsavedWorkspaceDocuments(workspace.id);
  const blocked = store.isBusy || project.isReadOnlyFromCache || unsaved || current.sourceId === null
    || current.removedAt !== null || current.removalPending === true;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const notice = unsaved ? <Alert severity="warning">{t("workspaces.relocateUnsaved")}</Alert> : null;
  const identityHelp = current.isPrimary
    ? <Alert severity="warning">{t("workspaces.relocatePrimaryHelp")}</Alert> : null;

  /** Publishes only the source-validated destination; errors keep the dialog open. */
  async function handleRelocate(): Promise<void> {
    if (blocked || !confirmed || destination.length === 0) return;
    await store.relocate(workspace.id, destination, confirmed);
    if (store.error === null) onClose();
  }

  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("workspaces.relocate")}</DialogTitle>
      <DialogContent>
        <Alert severity="info">{t("workspaces.relocateHelp")}</Alert>
        {identityHelp}
        <TextField label={t("workspaces.previousPath")} value={current.path} fullWidth margin="normal"
          slotProps={{ input: { readOnly: true } }} />
        <TextField label={t("workspaces.destination")} value={destination} fullWidth margin="normal"
          disabled={blocked} onChange={event => { setDestination(event.target.value); setConfirmed(false); }} />
        <FormControlLabel control={<Checkbox checked={confirmed} disabled={blocked}
          onChange={event => setConfirmed(event.target.checked)} />} label={t("workspaces.relocateConfirm")} />
        {notice}{error}
      </DialogContent>
      <DialogActions>
        <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
        <Button disabled={blocked || !confirmed || destination.length === 0} onClick={handleRelocate}>
          {t("workspaces.relocate")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceRelocateDialogX = observer(WorkspaceRelocateDialog);
