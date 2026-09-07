import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";

/** Makes the destination and the restricted execution policy reviewable before a transition. */
export function WorkspaceSwitchDialog({ project, thread, onClose }: {
  project: ProjectStore; thread: OpenCodexThread; onClose: () => void;
}) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const current = store.workspaces.find((item) => item.path === thread.projectPath && item.removedAt === null);
  const [workspaceId, setWorkspaceId] = useState(current?.id ?? "");
  const destination = store.workspaces.find((item) => item.id === workspaceId);
  const chat = project.chatsById.get(thread.id);
  const empty = chat !== undefined && chat.timeline.turns.length === 0;
  const disabled = store.isBusy || project.isReadOnlyFromCache || chat?.runtime.isWorking === true;
  const choices = store.workspaces.filter((item) => item.removedAt === null).map((item) => (
    <MenuItem key={item.id} value={item.id}>{workspaceLabel(item, t("workspaces.primary"))}</MenuItem>
  ));
  const emptyHint = empty ? <Alert severity="info">{t("workspaces.emptyConversation")}</Alert> : null;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const recovery = store.error === null ? null : <Button disabled={disabled} onClick={handleRecover}>
    {t("workspaces.recover")}
  </Button>;
  /** Applies only a backend-verified selection, keeping failures visible. */
  async function handleSwitch(): Promise<void> {
    await store.select(workspaceId, thread.id);
    if (store.error === null) onClose();
  }
  /** Reconciles this conversation even if the selected chat changes while the dialog is open. */
  async function handleRecover(): Promise<void> {
    await store.recoverThread(thread.id);
    if (store.error === null) onClose();
  }
  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm"
      onClick={(event) => event.stopPropagation()}>
      <DialogTitle>{t("workspaces.switch")}</DialogTitle>
      <DialogContent>
        <DialogContentText>{thread.title}</DialogContentText>
        <TextField select fullWidth margin="normal" label={t("workspaces.current")} value={workspaceId}
          disabled={disabled || empty} onChange={(event) => setWorkspaceId(event.target.value)}>{choices}</TextField>
        <DialogContentText>{destination?.path}</DialogContentText>
        <DialogContentText sx={{ mt: 2 }}>{t("workspaces.switchSummary")}</DialogContentText>
        <DialogContentText sx={{ mt: 2 }}>{t("workspaces.switchHelp")}</DialogContentText>
        {emptyHint}{error}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={store.isBusy}>{t("workspaces.close")}</Button>
        {recovery}
        <Button onClick={handleSwitch} disabled={disabled || empty || destination === undefined || workspaceId === current?.id}>
          {t("workspaces.switch")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceSwitchDialogX = observer(WorkspaceSwitchDialog);
