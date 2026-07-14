/**
 * Renders one Git file status row.
 */
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import {
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Checkbox,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import type { MouseEvent, ReactNode } from "react";
import { useState } from "react";

import type { OpenCodexGitFile } from "@open-codex-ui/opencodex-protocol";

type ProjectGitFileRowProps = {
  actionIcon: ReactNode;
  actionLabel: string;
  actionPath?: string;
  checked: boolean;
  canOpenFile: boolean;
  deferDirectoryLabel?: string;
  deferFileLabel?: string;
  disabled?: boolean;
  file: OpenCodexGitFile;
  onDeferDirectory?(path: string): void;
  onDeferFile?(path: string): void;
  onAction(path: string): void;
  onOpenFile(path: string): void;
  onToggle?(path: string): void;
};

/**
 * Renders a selectable Git file with one staging action.
 *
 * @param props Component props.
 *
 * @returns Rendered Git file row.
 */
export function ProjectGitFileRow({
  actionIcon,
  actionLabel,
  actionPath,
  checked,
  canOpenFile,
  deferDirectoryLabel,
  deferFileLabel,
  disabled = false,
  file,
  onDeferDirectory,
  onDeferFile,
  onAction,
  onOpenFile,
  onToggle
}: ProjectGitFileRowProps) {
  const [deferMenuAnchor, setDeferMenuAnchor] = useState<HTMLElement | null>(null);

  function handleToggle(): void {
    onToggle?.(file.path);
  }

  function handleAction(): void {
    onAction(actionPath ?? file.path);
  }

  function handleDeferFile(): void {
    onDeferFile?.(file.path);
  }

  function handleDeferDirectory(): void {
    const directory = splitGitPath(file.path).directory;

    if (directory.length > 0) {
      onDeferDirectory?.(directory);
    }
  }

  function handleOpenDeferMenu(event: MouseEvent<HTMLButtonElement>): void {
    setDeferMenuAnchor(event.currentTarget);
  }

  function handleCloseDeferMenu(): void {
    setDeferMenuAnchor(null);
  }

  function handleDeferFileFromMenu(): void {
    handleCloseDeferMenu();
    handleDeferFile();
  }

  function handleDeferDirectoryFromMenu(): void {
    handleCloseDeferMenu();
    handleDeferDirectory();
  }

  function handleOpenFile(): void {
    onOpenFile(file.path);
  }

  const fileDisplay = splitGitPath(file.path);
  const statusDisplay = getStatusDisplay(file.status);
  const nameContent = canOpenFile ? (
    <button
      className="git-file-name git-file-name-link"
      type="button"
      title={file.path}
      onClick={handleOpenFile}
    >
      {fileDisplay.name}
    </button>
  ) : (
    <Typography className="git-file-name" variant="body2">
      {fileDisplay.name}
    </Typography>
  );

  return (
    <Stack
      className="git-file-row"
      direction="row"
      spacing={0.5}
      sx={{ alignItems: "center" }}
    >
      <Checkbox
        checked={checked}
        disabled={disabled || onToggle === undefined}
        size="small"
        slotProps={{ input: { "aria-label": file.path } }}
        onChange={onToggle === undefined ? undefined : handleToggle}
      />
      <span className="git-file-copy" title={file.path}>
        {nameContent}
        {fileDisplay.directory.length > 0 ? (
          <Typography className="git-file-directory" variant="caption" color="text.secondary">
            {fileDisplay.directory}
          </Typography>
        ) : null}
      </span>
      <span className={`git-file-state git-file-state-${file.status}`} title={file.status}>
        {statusDisplay}
      </span>
      <Tooltip title={actionLabel}>
        <IconButton aria-label={actionLabel} disabled={disabled} size="small" onClick={handleAction}>
          {actionIcon}
        </IconButton>
      </Tooltip>
      {onDeferFile !== undefined ? (
        <>
          <Tooltip title={deferFileLabel ?? ""}>
            <IconButton
              aria-label={deferFileLabel}
              disabled={disabled}
              size="small"
              onClick={handleOpenDeferMenu}
            >
              <MoreVertOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={deferMenuAnchor}
            open={deferMenuAnchor !== null}
            onClose={handleCloseDeferMenu}
          >
            <MenuItem
              onClick={handleDeferFileFromMenu}
            >
              <ListItemIcon>
                <ArchiveOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>{deferFileLabel}</ListItemText>
            </MenuItem>
            {onDeferDirectory !== undefined && fileDisplay.directory.length > 0 ? (
              <MenuItem
                onClick={handleDeferDirectoryFromMenu}
              >
                <ListItemIcon>
                  <FolderOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{deferDirectoryLabel}</ListItemText>
              </MenuItem>
            ) : null}
          </Menu>
        </>
      ) : null}
    </Stack>
  );
}

function splitGitPath(path: string): { directory: string; name: string } {
  const separatorIndex = path.lastIndexOf("/");

  if (separatorIndex < 0) {
    return {
      directory: "",
      name: path
    };
  }

  return {
    directory: path.slice(0, separatorIndex),
    name: path.slice(separatorIndex + 1)
  };
}

function getStatusDisplay(status: OpenCodexGitFile["status"]): string {
  if (status === "added" || status === "untracked") {
    return "A";
  }

  if (status === "modified") {
    return "M";
  }

  if (status === "deleted") {
    return "D";
  }

  if (status === "renamed") {
    return "R";
  }

  if (status === "copied") {
    return "C";
  }

  if (status === "conflicted") {
    return "!";
  }

  return "?";
}
