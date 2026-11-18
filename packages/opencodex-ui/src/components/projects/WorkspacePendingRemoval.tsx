import { Alert, Button, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { ProjectWorkspacesStore } from "../../stores/project/ProjectWorkspacesStore";
import { WorkspaceOperationError } from "./WorkspaceOperationError";

/** Shows waiting intent separately from an interrupted physical operation that needs verification. */
export function WorkspacePendingRemoval({ removal, store, disabled }: {
  removal: OpenCodexWorkspaceRemoval; store: ProjectWorkspacesStore; disabled: boolean;
}) {
  const { t } = useTranslation();
  const waiting = removal.deferredState === "queued" || removal.deferredState === "blocked";
  let message = t("workspaces.removalPending", { path: removal.workspacePath });
  let actions = <Button disabled={disabled} onClick={() => void store.recoverRemoval(removal.id)}>
    {t("workspaces.recover")}</Button>;
  let reason = null;
  if (waiting) {
    message = t("workspaces.deferredRemovalWaiting", { path: removal.workspacePath });
    let retry = null;
    if (removal.deferredState === "blocked") {
      message = t("workspaces.deferredRemovalBlocked", { path: removal.workspacePath });
      reason = <WorkspaceOperationError message={removal.blockedReason ?? null} />;
      retry = <Button disabled={store.isBusy} onClick={() => void store.retryDeferredRemoval(removal.id)}>
        {t("workspaces.retryRemoval")}</Button>;
    }
    actions = <Stack direction="row" sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
      {retry}
      <Button disabled={store.isBusy} onClick={() => void store.cancelDeferredRemoval(removal.id)}>
        {t("workspaces.cancelRemoval")}</Button>
    </Stack>;
  }
  return <Alert severity="warning" sx={{ minWidth: 0, "& .MuiAlert-message": { minWidth: 0, width: "100%" } }}>
    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{message}</Typography>
    {reason}{actions}
  </Alert>;
}

export const WorkspacePendingRemovalX = observer(WorkspacePendingRemoval);
