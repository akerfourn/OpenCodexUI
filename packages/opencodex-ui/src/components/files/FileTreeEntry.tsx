import { useState, type MouseEvent } from "react";
import { useTheme } from "@mui/material/styles";
import { observer } from "mobx-react-lite";
import { Box, ListItemButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import CodeOutlined from "@mui/icons-material/CodeOutlined";
import ImageOutlined from "@mui/icons-material/ImageOutlined";
import LockOutlined from "@mui/icons-material/LockOutlined";
import { FileLinkAccessDialogX } from "./FileLinkAccessDialog";
import LinkOutlined from "@mui/icons-material/LinkOutlined";
import ChevronRight from "@mui/icons-material/ChevronRight";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import type { OpenCodexFileEntry } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceTreeStore } from "../../stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import { FileTreeDirectoryX } from "./FileTreeDirectory";

/** One accessible entry; external links expose workspace-scoped access controls. */
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
  const theme = useTheme();
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const [managing, setManaging] = useState(false);
  const path = parentPath.length === 0 ? entry.name : `${parentPath}/${entry.name}`;
  const directory = entry.kind === "directory";
  const blocked = entry.linkError !== undefined;
  const expanded = directory && !blocked && tree.expanded.has(path);
  const ariaExpanded = directory ? expanded : undefined;
  const disabled = blocked || entry.kind === "symlink" || entry.kind === "other";
  let icon = <DescriptionOutlined fontSize="small" />;
  if (/\.(tsx?|jsx?|json|ya?ml|toml|py|rs|css|html|sh)$/i.test(entry.name))
    icon = <CodeOutlined fontSize="small" />;
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(entry.name)) icon = <ImageOutlined fontSize="small" />;
  if (directory)
    icon = expanded ? (
      <FolderOpenOutlined fontSize="small" />
    ) : (
      <FolderOutlined fontSize="small" />
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
  let linkIndicator = null;
  let tooltip = path;
  if (entry.linkTarget !== undefined) {
    if (entry.kind !== "symlink") linkIndicator = <LinkOutlined sx={{ fontSize: 14 }} />;
    tooltip = `${path} → ${entry.linkTarget}`;
  }
  if (entry.linkError !== undefined) tooltip += ` — ${t(`files.errors.${entry.linkError}`)}`;
  let color = directory ? "primary.main" : "text.primary";
  let lock = null;
  if (entry.linkAccess?.external) {
    tooltip += ` — ${t(`files.access.${entry.linkAccess.access}`)}`;
    color = theme.palette.mode === "dark" ? "secondary.main" : "secondary.dark";
    if (entry.linkAccess.access === "readOnly") {
      color = theme.palette.mode === "dark" ? "secondary.light" : "secondary.main";
      lock = <LockOutlined sx={{ fontSize: 14 }} />;
    }
  }
  if (disabled) color = "text.disabled";

  /** Keeps the context menu usable even when normal opening is prohibited. */
  function contextMenu(event: MouseEvent): void {
    if (!entry.linkAccess?.external) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ left: event.clientX, top: event.clientY });
  }

  /** Opens the permission editor for the destination shown in this listing. */
  function manage(): void {
    setMenu(null);
    setManaging(true);
  }

  let contextMenuContent = null;
  if (menu !== null) {
    contextMenuContent = <Menu open onClose={() => setMenu(null)} anchorReference="anchorPosition"
      anchorPosition={menu}>
      <MenuItem onClick={manage}>{t("files.access.manage")}</MenuItem>
    </Menu>;
  }
  let accessDialog = null;
  if (managing && entry.linkAccess?.external) {
    accessDialog = <FileLinkAccessDialogX tree={tree} files={files} path={path}
      link={entry.linkAccess} onClose={() => setManaging(false)} />;
  }
  const selected =
    files.active?.target?.sourceId === tree.context.sourceId &&
    files.active.target.workspaceId === tree.context.workspaceId &&
    files.active.target.workspacePath === tree.context.workspacePath &&
    files.active.target.path === path;
  /** Expands a directory or opens a file with its original context. */
  function open(): void {
    if (disabled) return;
    if (directory) tree.toggle(path);
    else void files.open({ ...tree.context, path }, workspaceName);
  }
  return (
    <>
      <Tooltip title={tooltip} placement="left">
        <Box onContextMenu={contextMenu}>
          <ListItemButton
            dense
            aria-disabled={disabled}
            selected={selected}
            onClick={open}
            role="treeitem"
            aria-expanded={ariaExpanded}
            sx={{ pl: depth * 1.5, gap: 0.5, minHeight: 30, color, cursor: disabled ? "default" : "pointer" }}
          >
            {arrow}
            {icon}
            {linkIndicator}
            {lock}
            <Typography variant="body2" noWrap>
              {entry.name}
            </Typography>
          </ListItemButton>
        </Box>
      </Tooltip>
      {contextMenuContent}
      {accessDialog}
      {children}
    </>
  );
}
export const FileTreeEntryX = observer(FileTreeEntry);
