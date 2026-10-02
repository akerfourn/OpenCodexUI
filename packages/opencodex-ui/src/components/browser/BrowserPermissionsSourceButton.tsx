import { useState } from "react";
import { observer } from "mobx-react-lite";
import { IconButton, Tooltip } from "@mui/material";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import { useTranslation } from "react-i18next";
import { supportsBrowserPermissions, type OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { BrowserPermissionsDialogX } from "./BrowserPermissionsDialog";

/** Adds global browser settings only to sources that explicitly expose local files. */
export function BrowserPermissionsSourceButton({ root, source }: { root: RootStore; source: OpenCodexSource }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!supportsBrowserPermissions(source)) return null;
  const dialog = open
    ? <BrowserPermissionsDialogX root={root} sourceId={source.id} threadId={null} onClose={handleClose} /> : null;

  /** Opens settings for this source, regardless of the active Home filter. */
  function handleOpen(): void { setOpen(true); }
  /** Unmounts the editor so reopening always reads a fresh snapshot. */
  function handleClose(): void { setOpen(false); }
  return (
    <>
      <Tooltip title={t("browserPermissions.sourceTitle")}>
        <IconButton size="small" aria-label={t("browserPermissions.sourceTitle")} onClick={handleOpen}>
          <TuneOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {dialog}
    </>
  );
}

export const BrowserPermissionsSourceButtonX = observer(BrowserPermissionsSourceButton);
