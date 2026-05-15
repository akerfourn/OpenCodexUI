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
  file: OpenCodexGitFile;
  onAction(path: string): void;
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
  file,
  onAction,
  onToggle
}: ProjectGitFileRowProps) {
  function handleToggle(): void {
    onToggle(file.path);
  }

  function handleAction(): void {
    onAction(file.path);
  }

  return (
    <Stack
      className="git-file-row"
      direction="row"
      spacing={0.75}
      sx={{ alignItems: "center" }}
    >
      <Checkbox
        checked={checked}
        size="small"
        slotProps={{ input: { "aria-label": file.path } }}
        onChange={handleToggle}
      />
      <Typography className="git-file-path" variant="body2" title={file.path}>
        {file.path}
      </Typography>
      <Typography className="git-file-state" variant="caption" color="text.secondary">
        {file.status}
      </Typography>
      <Tooltip title={actionLabel}>
        <IconButton aria-label={actionLabel} size="small" onClick={handleAction}>
          {actionIcon}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}
