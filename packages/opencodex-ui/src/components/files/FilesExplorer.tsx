import { observer } from "mobx-react-lite";
import { Alert, Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import Refresh from "@mui/icons-material/Refresh";
import { useEffect, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { FileTreeDirectoryX } from "./FileTreeDirectory";
import { FileTreeContextMenuX } from "./FileTreeContextMenu";
import { FileOperationDialogX } from "./FileOperationDialog";

/** Right-side workspace explorer; selecting another tool leaves documents untouched. */
export function FilesExplorer({ projectStore }: { projectStore: ProjectStore }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  const files = projectStore.files;
  const tree = files.tree;
  const gitStatusStore = projectStore.gitStore.statusStore;
  const workspace = projectStore.workspaces.current;
  const workspaceName = workspace?.name ?? t("files.title");
  useEffect(() => { setMenu(null); }, [tree]);
  useEffect(() => {
    if (tree !== null && !gitStatusStore.hasLoaded && !gitStatusStore.isLoading) {
      void gitStatusStore.refresh();
    }
  }, [tree, gitStatusStore]);
  /** Invalidates old directory replies and reloads the root. */
  function refresh(): void {
    tree?.refresh();
    if (!gitStatusStore.isLoading) void gitStatusStore.refresh();
  }
  /** Offers paste on empty space and the workspace header, including an empty root. */
  function contextMenu(event: MouseEvent): void {
    if (tree === null) return;
    event.preventDefault();
    event.stopPropagation();
    setMenu({ left: event.clientX, top: event.clientY });
  }
  /** Releases the root menu after selection or dismissal. */
  function closeMenu(): void {
    setMenu(null);
  }
  let content = <Alert severity="info">{t("files.noWorkspace")}</Alert>;
  if (tree !== null)
    content = (
      <FileTreeDirectoryX
        key={JSON.stringify(tree.context)}
        tree={tree}
        files={files}
        gitStatusStore={gitStatusStore}
        path=""
        workspaceName={workspaceName}
      />
    );
  const unavailable = projectStore.isReadOnlyFromCache ? (
    <Alert severity="warning">{t("files.sourceUnavailable")}</Alert>
  ) : null;
  const rootMenu = menu !== null && tree !== null ? <FileTreeContextMenuX tree={tree} files={files}
    path="" anchor={menu} onClose={closeMenu} /> : null;
  return (
    <Box className="files-explorer" onContextMenu={contextMenu}>
      <Stack direction="row" sx={{ alignItems: "center", p: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" noWrap>
            {workspaceName}
          </Typography>
          <Tooltip title={workspace?.path ?? ""}>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {workspace?.path}
            </Typography>
          </Tooltip>
        </Box>
        <Tooltip title={t("files.refresh")}>
          <IconButton aria-label={t("files.refresh")} onClick={refresh}>
            <Refresh fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {unavailable}
      <Box role="tree" aria-label={t("files.title")} sx={{ overflow: "auto", flex: 1 }}>
        {content}
      </Box>
      {rootMenu}
      <FileOperationDialogX operations={files.operations} />
    </Box>
  );
}
export const FilesExplorerX = observer(FilesExplorer);
