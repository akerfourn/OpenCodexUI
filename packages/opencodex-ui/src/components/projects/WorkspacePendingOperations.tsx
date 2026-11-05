import { Alert, Button, Stack } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { ProjectWorkspacesStore } from "../../stores/project/ProjectWorkspacesStore";

/** Existing journals expose verified recovery in both project and Home management views. */
export function WorkspacePendingOperations({ store, disabled }: {
  store: ProjectWorkspacesStore; disabled: boolean;
}) {
  const { t } = useTranslation();
  const creations = store.pending.map(item => <Alert severity="warning" key={item.id} action={
    <Button disabled={disabled} onClick={() => void store.recoverCreation(item.id)}>{t("workspaces.recover")}</Button>
  }>{t("workspaces.pending", { path: item.destinationPath })}</Alert>);
  const removals = store.pendingRemovals.map(item => <Alert severity="warning" key={item.id} action={
    <Button disabled={disabled} onClick={() => void store.recoverRemoval(item.id)}>{t("workspaces.recover")}</Button>
  }>{t("workspaces.removalPending", { path: item.workspacePath })}</Alert>);
  const moves = store.pendingMoves.map(item => <Alert severity="warning" key={item.id} action={
    <Button disabled={disabled} onClick={() => void store.recoverMove(item.id)}>{t("workspaces.recover")}</Button>
  }>{t("workspaces.movePending", { from: item.workspacePath, to: item.destinationPath })}</Alert>);
  if (creations.length === 0 && removals.length === 0 && moves.length === 0) return null;
  return <Stack spacing={1}>{creations}{removals}{moves}</Stack>;
}

export const WorkspacePendingOperationsX = observer(WorkspacePendingOperations);
