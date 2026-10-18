import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { Dialog, DialogTitle } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import { BrowserPermissionsStore } from "../../stores/app/BrowserPermissionsStore";
import { BrowserPermissionsPanelX } from "./BrowserPermissionsPanel";

/** Hosts the shared browser rule editor for one explicitly identified conversation. */
export function BrowserPermissionsDialog({ root, sourceId, threadId, onClose }: {
  root: RootStore; sourceId: string; threadId: string | null; onClose(): void;
}) {
  const { t } = useTranslation();
  const state = useMemo(() => new BrowserPermissionsStore(root, { sourceId, threadId }), [root, sourceId, threadId]);
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={state.busy ? undefined : onClose}
      aria-labelledby="browser-permissions-title">
      <DialogTitle id="browser-permissions-title">{t("browserPermissions.title")}</DialogTitle>
      <BrowserPermissionsPanelX state={state} onClose={onClose} />
    </Dialog>
  );
}

export const BrowserPermissionsDialogX = observer(BrowserPermissionsDialog);
