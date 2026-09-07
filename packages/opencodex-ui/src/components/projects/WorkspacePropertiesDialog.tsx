import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";

/** Edits secondary names while presenting the source-owned physical path as a property. */
export function WorkspacePropertiesDialog({ project, workspace, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; onClose: () => void;
}) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const [name, setName] = useState(workspaceLabel(workspace, t("workspaces.primary")));
  const readOnly = workspace.isPrimary || workspace.removedAt !== null || project.isReadOnlyFromCache;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const help = workspace.isPrimary ? <Alert severity="info">{t("workspaces.primaryHelp")}</Alert> : null;
  const save = readOnly ? null : <Button onClick={handleSave}
    disabled={store.isBusy || name.trim().length === 0 || name.trim().length > 100}>
    {t("workspaces.save")}
  </Button>;
  /** Persists display metadata without moving the worktree. */
  async function handleSave(): Promise<void> {
    await store.rename(workspace.id, name);
    if (store.error === null) onClose();
  }
  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("workspaces.properties")}</DialogTitle>
      <DialogContent>
        {help}
        <TextField label={t("workspaces.name")} value={name} fullWidth margin="normal"
          disabled={readOnly || store.isBusy} onChange={(event) => setName(event.target.value)} />
        <TextField label={t("workspaces.destination")} value={workspace.path} fullWidth margin="normal"
          slotProps={{ input: { readOnly: true } }} helperText={t("workspaces.pathHelp")} />
        {error}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={store.isBusy}>{t("workspaces.close")}</Button>
        {save}
      </DialogActions>
    </Dialog>
  );
}
export const WorkspacePropertiesDialogX = observer(WorkspacePropertiesDialog);
