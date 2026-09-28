import { useEffect, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { Button, Stack, Typography } from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { useTranslation } from "react-i18next";
import type { OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { DebugImportStore } from "../../stores/debug/DebugImportStore";
import { DebugImportDialogX } from "./DebugImportDialog";

/** Mounted with a workspace identity key so no late detection result leaks into another project. */
export function DebugImportButton({ root, context }: { root: RootStore; context: OpenCodexFileContext }) {
  const { t } = useTranslation();
  const [store] = useState(() => new DebugImportStore(root, context));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void store.detect();
    return () => store.dispose();
  }, [store]);

  /** Reads launch.json only after the user requests an import. */
  function handleOpen(): void { setOpen(true); void store.load(); }
  /** Closing does not save any preview data. */
  function handleClose(): void { setOpen(false); }

  let hint: ReactNode = null;
  if (store.detected) hint = <Typography variant="caption">{t("debug.import.detected")}</Typography>;
  let dialog: ReactNode = null;
  if (open) dialog = <DebugImportDialogX store={store} debug={root.debugStore} onClose={handleClose} />;
  return <Stack sx={{ alignItems: "flex-start" }}>
    {hint}
    <Button startIcon={<FileDownloadOutlinedIcon />} onClick={handleOpen}>{t("debug.import.button")}</Button>
    {dialog}
  </Stack>;
}
export const DebugImportButtonX = observer(DebugImportButton);
