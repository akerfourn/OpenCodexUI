import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { ProjectWorkspacesStore } from "../../stores/project/ProjectWorkspacesStore";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";
import { WorkspaceRemovalInspection } from "./WorkspaceRemovalInspection";
import { useWorkspaceRemovalInspection } from "./useWorkspaceRemovalInspection";

/** Explains a fixed removal intent and requires new confirmation before authorizing file loss. */
export function WorkspaceRemovalStatusDialog({ removal, store, disabled, onClose }: {
  removal: OpenCodexWorkspaceRemoval; store: ProjectWorkspacesStore; disabled: boolean; onClose(): void;
}) {
  const { t } = useTranslation();
  const [confirmation, setConfirmation] = useState("");
  const blocked = removal.deferredState === "blocked";
  const waiting = blocked || removal.deferredState === "queued";
  const workspace = store.workspaces.find(item => item.id === removal.workspaceId);
  const name = workspace === undefined ? removal.workspaceId : workspaceLabel(workspace, t("workspaces.primary"));
  const inspection = useWorkspaceRemovalInspection(store, { id: removal.workspaceId, projectId: removal.projectId,
    sourceId: removal.sourceId, path: removal.workspacePath }, blocked && !disabled);
  const newForce = inspection.force && removal.force !== true;
  const canRetry = !disabled && !store.isBusy && inspection.result !== null && !inspection.loading
    && (inspection.result.totalFileCount === 0 || inspection.force || removal.force === true)
    && (!newForce || confirmation === name);
  let message = t("workspaces.removalPending", { path: removal.workspacePath });
  if (removal.deferredState === "queued") message = t("workspaces.deferredRemovalWaiting", { path: removal.workspacePath });
  else if (blocked) message = t("workspaces.deferredRemovalBlocked", { path: removal.workspacePath });
  let actions = <Button disabled={disabled || store.isBusy} onClick={handleRecover}>{t("workspaces.recover")}</Button>;
  if (waiting) {
    const retryLabel = newForce ? t("workspaces.forceRemovalAction") : t("workspaces.retryRemoval");
    const retry = blocked ? <Button color="error" disabled={!canRetry} onClick={handleRetry}>{retryLabel}</Button> : null;
    actions = <>{retry}<Button disabled={store.isBusy} onClick={handleCancel}>{t("workspaces.cancelRemoval")}</Button></>;
  }
  const inspectionContent = blocked && !disabled ? <WorkspaceRemovalInspection inspection={inspection}
    disabled={store.isBusy} forceAuthorized={removal.force === true} /> : null;
  const confirm = newForce ? <TextField fullWidth label={t("workspaces.removeConfirm", { name })}
    value={confirmation} disabled={store.isBusy} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /> : null;

  /** Cancels only undispatched intent and closes after the persisted outcome is known. */
  async function handleCancel(): Promise<void> {
    await store.cancelDeferredRemoval(removal.id);
    if (store.error === null) onClose();
  }
  /** Queues a retry, escalating file-loss consent only after the displayed confirmation. */
  async function handleRetry(): Promise<void> {
    if (!canRetry) return;
    if (newForce) await store.retryDeferredRemoval(removal.id, true);
    else await store.retryDeferredRemoval(removal.id);
    if (store.error === null) onClose();
  }
  /** Verifies an interrupted command without repeating its destructive effects. */
  async function handleRecover(): Promise<void> {
    await store.recoverRemoval(removal.id);
    if (store.error === null) onClose();
  }

  return <Dialog open fullWidth maxWidth="sm" onClose={store.isBusy ? undefined : onClose}>
    <DialogTitle>{t("workspaces.removalDetails")}</DialogTitle>
    <DialogContent><Stack spacing={2}>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{message}</Typography>

      {inspectionContent}{confirm}
    </Stack></DialogContent>
    <DialogActions sx={{ flexWrap: "wrap" }}>{actions}
      <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
    </DialogActions>
  </Dialog>;
}

export const WorkspaceRemovalStatusDialogX = observer(WorkspaceRemovalStatusDialog);
