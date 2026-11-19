import AutoDeleteOutlinedIcon from "@mui/icons-material/AutoDeleteOutlined";
import { Button, IconButton, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { ProjectWorkspacesStore } from "../../stores/project/ProjectWorkspacesStore";
import { WorkspaceRemovalStatusDialogX } from "./WorkspaceRemovalStatusDialog";

/** Keeps pending deletion compact; explanations and cancellation appear only on demand. */
export function WorkspacePendingRemoval({ removal, store, disabled, compact = false }: {
  removal: OpenCodexWorkspaceRemoval; store: ProjectWorkspacesStore; disabled: boolean; compact?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const tooltip = removal.deferredState === "blocked" ? t("workspaces.deletionBlockedLabel") : t("workspaces.deletionPendingLabel");
  let trigger = <Button size="small" color="warning" startIcon={<AutoDeleteOutlinedIcon />} onClick={() => setOpen(true)}
    aria-label={t("workspaces.removalDetails")} sx={{ justifyContent: "flex-start", overflowWrap: "anywhere" }}>
    {removal.workspacePath}</Button>;
  if (compact) trigger = <IconButton size="small" color="warning" aria-label={t("workspaces.removalDetails")}
    onClick={() => setOpen(true)}><AutoDeleteOutlinedIcon fontSize="small" /></IconButton>;
  const dialog = open ? <WorkspaceRemovalStatusDialogX removal={removal} store={store} disabled={disabled}
    onClose={() => setOpen(false)} /> : null;
  return <><Tooltip title={tooltip} placement="right">{trigger}</Tooltip>{dialog}</>;
}

export const WorkspacePendingRemovalX = observer(WorkspacePendingRemoval);
