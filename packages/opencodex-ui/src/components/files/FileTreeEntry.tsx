import { observer } from "mobx-react-lite";
import { Box, ListItemButton, Tooltip, Typography } from "@mui/material";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import type { OpenCodexFileEntry } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceTreeStore } from "../../stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import { FileTreeDirectoryX } from "./FileTreeDirectory";

/** One accessible entry; symlinks remain visible but cannot escape the workspace. */
export function FileTreeEntry({
  entry,
  tree,
  files,
  parentPath,
  workspaceName,
  depth
}: {
  entry: OpenCodexFileEntry;
  tree: WorkspaceTreeStore;
  files: ProjectFilesStore;
  parentPath: string;
  workspaceName: string;
  depth: number;
}) {
  const { t } = useTranslation();
  const path = parentPath.length === 0 ? entry.name : `${parentPath}/${entry.name}`;
  const directory = entry.kind === "directory";
  const expanded = directory && tree.expanded.has(path);
  const ariaExpanded = directory ? expanded : undefined;
  const disabled = entry.kind === "symlink" || entry.kind === "other";
  let icon = <DescriptionOutlined fontSize="small" />;
  if (/\.(tsx?|jsx?|json|ya?ml|toml|py|rs|css|html|sh)$/i.test(entry.name))
    icon = <CodeOutlined fontSize="small" />;
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(entry.name)) icon = <ImageOutlined fontSize="small" />;
  if (directory)
    icon = expanded ? (
      <FolderOpenOutlined fontSize="small" color="primary" />
    ) : (
      <FolderOutlined fontSize="small" color="primary" />
    );
  if (entry.kind === "symlink") icon = <LinkOutlined fontSize="small" />;
  let arrow = <Box sx={{ width: 20 }} />;
  if (directory) {
    arrow = expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />;
  }
  const children = expanded ? (
    <FileTreeDirectoryX
      tree={tree}
      files={files}
      path={path}
      workspaceName={workspaceName}
      depth={depth + 1}
    />
  ) : null;
  const tooltip = entry.kind === "symlink" ? t("files.errors.symlink") : path;
  const selected =
    files.active?.target?.sourceId === tree.context.sourceId &&
    files.active.target.workspaceId === tree.context.workspaceId &&
    files.active.target.workspacePath === tree.context.workspacePath &&
    files.active.target.path === path;
  /** Expands a directory or opens a file with its original context. */
  function open(): void {
    if (directory) tree.toggle(path);
    else void files.open({ ...tree.context, path }, workspaceName);
  }
  return (
    <>
      <Tooltip title={tooltip} placement="left">
        <Box>
          <ListItemButton
            dense
            disabled={disabled}
            selected={selected}
            onClick={open}
            role="treeitem"
            aria-expanded={ariaExpanded}
            sx={{ pl: depth * 1.5, gap: 0.5, minHeight: 30 }}
          >
            {arrow}
            {icon}
            <Typography variant="body2" noWrap>
              {entry.name}
            </Typography>
          </ListItemButton>
        </Box>
      </Tooltip>
      {children}
    </>
  );
}
export const FileTreeEntryX = observer(FileTreeEntry);
