import { Box } from "@mui/material";
import type { OpenCodexGitFileState } from "@open-codex-ui/opencodex-protocol";
import type { GitDirectoryStatus } from "../../stores/project/git/gitDirectoryStatusIndex";
import { fileTreeGitMarker } from "./fileTreeGitPresentation";

interface FileTreeGitBadgeProps {
  status: OpenCodexGitFileState;
  summary?: GitDirectoryStatus;
  label: string;
  color: string;
}

/** Renders plain immutable Git snapshots; color is reinforced by a count or a letter marker. */
export function FileTreeGitBadge({ status, summary, label, color }: FileTreeGitBadgeProps) {
  let marker = fileTreeGitMarker(status);
  if (summary !== undefined) {
    marker = String(summary.count);
    if (summary.untrackedDirectories > 0) marker += "+";
    if (status === "conflicted") marker = `! ${marker}`;
  }
  return <Box component="span" data-git-state={status} data-git-directory={summary !== undefined}
    aria-label={label} title={label} sx={{ ml: "auto", flexShrink: 0, minWidth: 20, px: 0.5, py: 0.25,
      borderRadius: 0.75, color, bgcolor: `${color}18`, fontSize: 11, fontWeight: 700,
      lineHeight: 1.2, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{marker}</Box>;
}
