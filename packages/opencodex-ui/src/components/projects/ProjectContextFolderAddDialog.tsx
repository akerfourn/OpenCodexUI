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
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { observer } from "mobx-react-lite";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexProjectContextEnvFilePermission,
  OpenCodexProjectContextFolderPermission
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectContextStore } from "../../stores/project/ProjectContextStore";

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
  const [folderPermission, setFolderPermission] = useState<OpenCodexProjectContextFolderPermission>("read");
  const [envFilePermission, setEnvFilePermission] = useState<OpenCodexProjectContextEnvFilePermission>("deny");
  const normalizedPath = folderPath.trim();
  const isBusy = contextStore.isPickingFolder || contextStore.isSaving;
  const canAddManualPath = normalizedPath.length > 0 && !isBusy;

  useEffect(() => {
    if (open) {
      setFolderPath("");
      setFolderPermission("read");
      setEnvFilePermission("deny");
    }
  }, [open]);

  function handlePathChange(event: ChangeEvent<HTMLInputElement>): void {
    setFolderPath(event.target.value);
  }

  function handleFolderPermissionChange(event: SelectChangeEvent): void {
    const permission = event.target.value;

    if (!isFolderPermission(permission)) {
      return;
    }

    setFolderPermission(permission);

    if (permission === "read" && envFilePermission === "write") {
      setEnvFilePermission("deny");
    }
  }

  function handleEnvFilePermissionChange(event: SelectChangeEvent): void {
    const permission = event.target.value;

    if (!isEnvFilePermission(permission)) {
      return;
    }

    if (permission === "write" && folderPermission === "read") {
      return;
    }

    setEnvFilePermission(permission);
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

    await contextStore.addFolder(normalizedPath, {
      permission: folderPermission,
      envFilePermission
    });
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
          <FormControl fullWidth size="small">
            <InputLabel id="context-folder-permission-label">
              {t("contextFolders.folderPermission")}
            </InputLabel>
            <Select
              labelId="context-folder-permission-label"
              label={t("contextFolders.folderPermission")}
              value={folderPermission}
              onChange={handleFolderPermissionChange}
            >
              <MenuItem value="read">{t("contextFolders.folderPermissionRead")}</MenuItem>
              <MenuItem value="write">{t("contextFolders.folderPermissionWrite")}</MenuItem>
            </Select>
            <FormHelperText>{t("contextFolders.folderPermissionDescription")}</FormHelperText>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel id="context-env-file-permission-label">
              {t("contextFolders.envFilePermission")}
            </InputLabel>
            <Select
              labelId="context-env-file-permission-label"
              label={t("contextFolders.envFilePermission")}
              value={envFilePermission}
              onChange={handleEnvFilePermissionChange}
            >
              <MenuItem value="deny">{t("contextFolders.envFilePermissionDeny")}</MenuItem>
              <MenuItem value="read">{t("contextFolders.envFilePermissionRead")}</MenuItem>
              {folderPermission === "write" ? (
                <MenuItem value="write">{t("contextFolders.envFilePermissionWrite")}</MenuItem>
              ) : null}
            </Select>
            <FormHelperText>{t("contextFolders.envFilePermissionDescription")}</FormHelperText>
          </FormControl>
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

/**
 * Checks whether a select value is a supported context-folder permission.
 *
 * @param value Raw select value.
 * @returns Whether the value is supported.
 */
function isFolderPermission(value: string): value is OpenCodexProjectContextFolderPermission {
  return value === "read" || value === "write";
}

/**
 * Checks whether a select value is a supported `.env` permission.
 *
 * @param value Raw select value.
 * @returns Whether the value is supported.
 */
function isEnvFilePermission(value: string): value is OpenCodexProjectContextEnvFilePermission {
  return value === "deny" || value === "read" || value === "write";
}
