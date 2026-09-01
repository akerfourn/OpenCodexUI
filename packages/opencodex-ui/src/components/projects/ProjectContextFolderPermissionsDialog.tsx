/**
 * Renders the permissions dialog for one context folder.
 */
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
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import { observer } from "mobx-react-lite";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexProjectContextEnvFilePermission,
  OpenCodexProjectContextFolder,
  OpenCodexProjectContextFolderPermission
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectContextStore } from "../../stores/project/ProjectContextStore";

type ProjectContextFolderPermissionsDialogProps = {
  contextStore: ProjectContextStore;
  folder: OpenCodexProjectContextFolder;
  disabled: boolean;
  open: boolean;
  onClose(): void;
};

/**
 * Renders a dialog that edits folder and `.env` permissions together.
 *
 * @param props Component props.
 * @returns Rendered permissions dialog.
 */
export function ProjectContextFolderPermissionsDialog({
  contextStore,
  folder,
  disabled,
  open,
  onClose
}: ProjectContextFolderPermissionsDialogProps) {
  const { t } = useTranslation();
  const [folderPermission, setFolderPermission] = useState<OpenCodexProjectContextFolderPermission>(
    contextStore.getFolderPermission(folder)
  );
  const [envFilePermission, setEnvFilePermission] = useState<OpenCodexProjectContextEnvFilePermission>(
    contextStore.getFolderEnvFilePermission(folder)
  );

  useEffect(() => {
    if (open) {
      setFolderPermission(contextStore.getFolderPermission(folder));
      setEnvFilePermission(contextStore.getFolderEnvFilePermission(folder));
    }
  }, [contextStore, folder, open]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (disabled) {
      return;
    }

    await contextStore.setFolderPermissions(
      folder.id,
      folderPermission,
      envFilePermission
    );
    onClose();
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t("contextFolders.permissionsTitle")}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {folder.path}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("contextFolders.permissionsDescription")}
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel id="context-folder-permission-edit-label">
                {t("contextFolders.folderPermission")}
              </InputLabel>
              <Select
                labelId="context-folder-permission-edit-label"
                label={t("contextFolders.folderPermission")}
                value={folderPermission}
                disabled={disabled}
                onChange={handleFolderPermissionChange}
              >
                <MenuItem value="read">{t("contextFolders.folderPermissionRead")}</MenuItem>
                <MenuItem value="write">{t("contextFolders.folderPermissionWrite")}</MenuItem>
              </Select>
              <FormHelperText>{t("contextFolders.folderPermissionDescription")}</FormHelperText>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel id="context-env-file-permission-edit-label">
                {t("contextFolders.envFilePermission")}
              </InputLabel>
              <Select
                labelId="context-env-file-permission-edit-label"
                label={t("contextFolders.envFilePermission")}
                value={envFilePermission}
                disabled={disabled}
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
          <Button type="button" disabled={disabled} onClick={onClose}>
            {t("contextFolders.cancel")}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={disabled}
            startIcon={disabled ? <CircularProgress color="inherit" size={14} /> : undefined}
          >
            {t("contextFolders.save")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export const ProjectContextFolderPermissionsDialogX = observer(ProjectContextFolderPermissionsDialog);

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
