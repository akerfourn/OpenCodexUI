/**
 * Renders one external read-only context folder row.
 */
import CheckBoxOutlineBlankOutlinedIcon from "@mui/icons-material/CheckBoxOutlineBlankOutlined";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DriveFileRenameOutlineOutlinedIcon from "@mui/icons-material/DriveFileRenameOutlineOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import {
  Box,
  Checkbox,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { MouseEvent } from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectContextFolder } from "@open-codex-ui/opencodex-protocol";

import type { ProjectContextStore } from "../../stores/ProjectContextStore";
import { ProjectContextFolderDeleteDialog } from "./ProjectContextFolderDeleteDialog";
import { ProjectContextFolderRenameDialog } from "./ProjectContextFolderRenameDialog";

type ProjectContextFolderRowProps = {
  contextStore: ProjectContextStore;
  folder: OpenCodexProjectContextFolder;
  disabled: boolean;
};

/**
 * Renders one context folder with enable and row actions.
 *
 * @param props Component props.
 * @returns Rendered context folder row.
 */
export function ProjectContextFolderRow({
  contextStore,
  folder,
  disabled
}: ProjectContextFolderRowProps) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [isRenameOpen, setRenameOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const folderName = folder.label ?? readFolderName(folder.path);

  function handleMenuOpen(event: MouseEvent<HTMLButtonElement>): void {
    setMenuAnchor(event.currentTarget);
  }

  function handleMenuClose(): void {
    setMenuAnchor(null);
  }

  function handleToggle(): void {
    void contextStore.setFolderEnabled(folder.id, !folder.enabled);
  }

  function handleOpenRename(): void {
    setRenameOpen(true);
    handleMenuClose();
  }

  function handleCloseRename(): void {
    setRenameOpen(false);
  }

  function handleRename(label: string | null): void {
    void contextStore.renameFolder(folder.id, label).finally(() => {
      setRenameOpen(false);
    });
  }

  function handleOpenDelete(): void {
    setDeleteOpen(true);
    handleMenuClose();
  }

  function handleCloseDelete(): void {
    setDeleteOpen(false);
  }

  function handleConfirmDelete(): void {
    void contextStore.removeFolder(folder.id).finally(() => {
      setDeleteOpen(false);
    });
  }

  return (
    <Box className="project-context-folder-row">
      <Checkbox
        size="small"
        checked={folder.enabled}
        disabled={disabled}
        icon={<CheckBoxOutlineBlankOutlinedIcon fontSize="small" />}
        checkedIcon={<CheckBoxOutlinedIcon fontSize="small" />}
        aria-label={t("contextFolders.toggle")}
        onChange={handleToggle}
      />
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography variant="body2" noWrap>
          {folderName}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{
            display: "block",
            direction: "rtl",
            textAlign: "left",
            unicodeBidi: "plaintext"
          }}
        >
          {folder.path}
        </Typography>
      </Box>
      <Tooltip title={t("contextFolders.actions")}>
        <span>
          <IconButton
            size="small"
            disabled={disabled}
            aria-label={t("contextFolders.actions")}
            onClick={handleMenuOpen}
          >
            <MoreVertOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={handleMenuClose}>
        <MenuItem disabled={disabled} onClick={handleOpenRename}>
          <ListItemIcon>
            <DriveFileRenameOutlineOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {t("contextFolders.rename")}
        </MenuItem>
        <MenuItem disabled={disabled} onClick={handleOpenDelete}>
          <ListItemIcon>
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {t("contextFolders.remove")}
        </MenuItem>
      </Menu>
      <ProjectContextFolderRenameDialog
        open={isRenameOpen}
        disabled={disabled}
        currentName={folderName}
        folderPath={folder.path}
        onClose={handleCloseRename}
        onSubmit={handleRename}
      />
      <ProjectContextFolderDeleteDialog
        open={isDeleteOpen}
        disabled={disabled}
        folderName={folderName}
        onClose={handleCloseDelete}
        onConfirm={handleConfirmDelete}
      />
    </Box>
  );
}

export const ProjectContextFolderRowX = observer(ProjectContextFolderRow);

function readFolderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
  return parts.at(-1) ?? path;
}
