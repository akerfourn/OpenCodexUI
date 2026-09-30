import { Menu, MenuItem } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexFileEntry } from "@open-codex-ui/opencodex-protocol";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import type { WorkspaceTreeStore } from "../../stores/files/WorkspaceTreeStore";

/** Shares entry and workspace-root actions without losing the clicked source context. */
export function FileTreeContextMenu({ entry, path, tree, files, anchor, onClose, onManage }: {
  entry?: OpenCodexFileEntry;
  path: string;
  tree: WorkspaceTreeStore;
  files: ProjectFilesStore;
  anchor: { left: number; top: number };
  onClose: () => void;
  onManage?: () => void;
}) {
  const { t } = useTranslation();
  const operations = files.operations;
  const destination = entry === undefined || entry.kind === "directory"
    ? path : path.split("/").slice(0, -1).join("/");
  const pasteBlocked = entry?.kind === "directory" &&
    (entry.linkError !== undefined || entry.linkAccess?.access === "readOnly");
  const entryBlocked = operations.isBusy || entry?.kind === "other";

  /** Records the source reference before dismissing the menu. */
  function copy(): void {
    operations.copy(tree, path);
    onClose();
  }
  /** Opens a destination-name dialog for the selected directory. */
  function paste(): void {
    operations.paste(tree, destination);
    onClose();
  }
  /** Opens a basename-only rename dialog. */
  function rename(): void {
    operations.select("rename", tree, path);
    onClose();
  }
  /** Opens a permanent-delete confirmation before any filesystem request. */
  function remove(): void {
    operations.select("delete", tree, path, entry?.linkTarget !== undefined || entry?.kind === "symlink");
    onClose();
  }

  const copyItem = entry === undefined ? null :
    <MenuItem onClick={copy} disabled={entryBlocked}>{t("files.operations.copy")}</MenuItem>;
  const renameItem = entry === undefined ? null :
    <MenuItem onClick={rename} disabled={entryBlocked}>{t("files.operations.rename")}</MenuItem>;
  const deleteItem = entry === undefined ? null :
    <MenuItem onClick={remove} disabled={entryBlocked} sx={{ color: "error.main" }}>{t("files.operations.delete")}</MenuItem>;
  const accessItem = entry?.linkAccess?.external === true ?
    <MenuItem onClick={onManage} disabled={operations.isBusy}>{t("files.access.manage")}</MenuItem> : null;

  return <Menu open onClose={onClose} anchorReference="anchorPosition" anchorPosition={anchor}>
    {copyItem}
    <MenuItem onClick={paste} disabled={pasteBlocked || !operations.canPaste(tree)}>{t("files.operations.paste")}</MenuItem>
    {renameItem}
    {deleteItem}
    {accessItem}
  </Menu>;
}

export const FileTreeContextMenuX = observer(FileTreeContextMenu);
