/**
 * Renders one Git file status row.
 */
import type { ReactNode } from "react";

import { Checkbox, IconButton, Stack, Tooltip, Typography } from "@mui/material";

import type { OpenCodexGitFile } from "@open-codex-ui/opencodex-protocol";

type ProjectGitFileRowProps = {
  actionIcon: ReactNode;
  actionLabel: string;
  checked: boolean;
  canOpenFile: boolean;
  file: OpenCodexGitFile;
  onAction(path: string): void;
  onOpenFile(path: string): void;
  onToggle(path: string): void;
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
  checked,
  canOpenFile,
  file,
  onAction,
  onOpenFile,
  onToggle
}: ProjectGitFileRowProps) {
  function handleToggle(): void {
    onToggle(file.path);
  }

  function handleAction(): void {
    onAction(file.path);
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
        size="small"
        slotProps={{ input: { "aria-label": file.path } }}
        onChange={handleToggle}
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
        <IconButton aria-label={actionLabel} size="small" onClick={handleAction}>
          {actionIcon}
        </IconButton>
      </Tooltip>
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
