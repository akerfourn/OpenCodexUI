import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceLockState } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";

/** Reviews the exact live Git lock before changing it, including locks created by external tools. */
export function WorkspaceLockDialog({ project, state, onClose }: {
  project: ProjectStore; state: OpenCodexWorkspaceLockState; onClose(): void;
}) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const [reason, setReason] = useState("");
  const unlocking = state.lockedReason !== null;
  const action = unlocking ? "workspaces.unlock" : "workspaces.lock";
  const workspace = store.workspaces.find(item => item.id === state.workspaceId);
  const latest = store.lockStates.get(state.workspaceId);
  const changed = latest !== undefined && (latest.workspacePath !== state.workspacePath || latest.lockedReason !== state.lockedReason);
  const blocked = store.isBusy || store.loadingLockIds.has(state.workspaceId) || project.isReadOnlyFromCache
    || !state.supported || workspace === undefined || workspace.isPrimary || workspace.removedAt !== null
    || workspace.sourceId !== state.sourceId || workspace.movePending === true || workspace.removalPending === true || workspace.path !== state.workspacePath || changed;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const changedNotice = changed ? <Alert severity="warning">{t("workspaces.lockChanged")}</Alert> : null;
  const reasonInput = unlocking ? (
    <TextField label={t("workspaces.lockReason")} value={state.lockedReason || t("workspaces.lockWithoutReason")}
      fullWidth margin="normal" multiline slotProps={{ input: { readOnly: true } }} />
  ) : (
    <TextField label={t("workspaces.lockReasonOptional")} value={reason} fullWidth margin="normal" disabled={store.isBusy}
      onChange={event => setReason(event.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
  );
  const help = unlocking ? t("workspaces.unlockHelp") : t("workspaces.lockHelp");

  /** Sends the reviewed state unchanged; a different external lock requires another confirmation. */
  async function handleApply(): Promise<void> {
    if (blocked || /[\0\r\n]/u.test(reason) || reason.trim().length > 500) return;
    await store.setLock(state, !unlocking, reason);
    if (store.error === null) onClose();
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={store.isBusy ? undefined : onClose}>
      <DialogTitle>{t(action)}</DialogTitle>
      <DialogContent>
        <Alert severity="info">{help}</Alert>
        <TextField label={t("workspaces.destination")} value={state.workspacePath} fullWidth margin="normal"
          slotProps={{ input: { readOnly: true } }} />
        {reasonInput}{changedNotice}{error}
      </DialogContent>
      <DialogActions>
        <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
        <Button disabled={blocked || /[\0\r\n]/u.test(reason) || reason.trim().length > 500} onClick={handleApply}>
          {t(action)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceLockDialogX = observer(WorkspaceLockDialog);
