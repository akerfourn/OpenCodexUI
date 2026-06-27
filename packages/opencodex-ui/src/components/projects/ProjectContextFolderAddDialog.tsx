/**
 * Renders the dialog used to add one context folder.
 */
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectContextStore } from "../../stores/ProjectContextStore";

type ProjectContextFolderAddDialogProps = {
  contextStore: ProjectContextStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders local picker and manual path entry actions for context folders.
 *
 * @param props Component props.
 * @returns Rendered add-folder dialog.
 */
export function ProjectContextFolderAddDialog({
  contextStore,
  open,
  onClose
}: ProjectContextFolderAddDialogProps) {
  const { t } = useTranslation();
  const [folderPath, setFolderPath] = useState("");
  const normalizedPath = folderPath.trim();
  const isBusy = contextStore.isPickingFolder || contextStore.isSaving;
  const canAddManualPath = normalizedPath.length > 0 && !isBusy;

  useEffect(() => {
    if (open) {
      setFolderPath("");
    }
  }, [open]);

  function handlePathChange(event: ChangeEvent<HTMLInputElement>): void {
    setFolderPath(event.target.value);
  }

  async function handlePickLocalFolder(): Promise<void> {
    const pickedFolderPath = await contextStore.pickFolderPath();

    if (pickedFolderPath !== null) {
      setFolderPath(pickedFolderPath);
    }
  }

  async function handleAddManualPath(): Promise<void> {
    if (!canAddManualPath) {
      return;
    }

    await contextStore.addFolder(normalizedPath);
    onClose();
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("contextFolders.addTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t("contextFolders.addDescription")}
          </Typography>
          <Button
            variant="outlined"
            startIcon={contextStore.isPickingFolder ? (
              <CircularProgress color="inherit" size={14} />
            ) : (
              <FolderOpenOutlinedIcon fontSize="small" />
            )}
            disabled={!contextStore.isAvailable || isBusy}
            onClick={handlePickLocalFolder}
          >
            {t("contextFolders.pickLocalFolder")}
          </Button>
          <TextField
            label={t("contextFolders.manualPath")}
            value={folderPath}
            fullWidth
            disabled={!contextStore.isAvailable || isBusy}
            placeholder={t("contextFolders.manualPathPlaceholder")}
            onChange={handlePathChange}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={isBusy} onClick={onClose}>
          {t("contextFolders.cancel")}
        </Button>
        <Button
          variant="contained"
          startIcon={contextStore.isSaving ? (
            <CircularProgress color="inherit" size={14} />
          ) : (
            <CreateNewFolderOutlinedIcon fontSize="small" />
          )}
          disabled={!canAddManualPath}
          onClick={handleAddManualPath}
        >
          {t("contextFolders.addManualPath")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectContextFolderAddDialogX = observer(ProjectContextFolderAddDialog);
