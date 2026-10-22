import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";

/** Names the exact checkout and requires explicit confirmation before irreversible file removal. */
export function WorkspaceRemoveDialog({ project, workspace, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; onClose(): void;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const store = project.workspaces;
  const current = store.workspaces.find(item => item.id === workspace.id) ?? workspace;
  const name = workspaceLabel(workspace, t("workspaces.primary"));
  const unsaved = project.files.hasUnsavedWorkspaceDocuments(workspace.id);
  const blocked = store.isBusy || unsaved || project.isReadOnlyFromCache || workspace.isPrimary
    || !current.managed || current.removedAt !== null || current.removalPending === true || current.movePending === true;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const unsavedNotice = unsaved ? <Alert severity="warning">{t("workspaces.removeUnsaved")}</Alert> : null;

  /** Closes only after the backend and durable catalogue confirm successful removal. */
  async function handleRemove(): Promise<void> {
    if (blocked || confirmation !== name) return;
    await store.remove(workspace.id);
    if (store.error === null) onClose();
  }

  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("workspaces.removeTitle", { name })}</DialogTitle>
      <DialogContent>
        <Alert severity="warning">{t("workspaces.removeHelp")}</Alert>
        <TextField label={t("workspaces.destination")} value={workspace.path} fullWidth margin="normal"
          slotProps={{ input: { readOnly: true } }} />
        <TextField label={t("workspaces.removeConfirm", { name })} value={confirmation} fullWidth margin="normal"
          disabled={store.isBusy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} />
        {unsavedNotice}{error}
      </DialogContent>
      <DialogActions>
        <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
        <Button color="error" disabled={blocked || confirmation !== name} onClick={handleRemove}>
          {t("workspaces.remove")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceRemoveDialogX = observer(WorkspaceRemoveDialog);
