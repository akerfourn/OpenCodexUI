import ContentCopyOutlined from "@mui/icons-material/ContentCopyOutlined";
import FolderOpenOutlined from "@mui/icons-material/FolderOpenOutlined";
import { ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { FileLinkMenuContext, type FileLinkMenuTarget } from "./FileLinkMenuContext";

/** Reuses link actions in both the common menu and the explorer's existing mutation menu. */
export function FileLinkMenuItems({ target, onClose }: {
  target: FileLinkMenuTarget;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const actions = useContext(FileLinkMenuContext);
  if (actions === null) return null;

  /** Captures the clicked context before dismissing the menu. */
  function handleOpenFolder(): void {
    actions?.openFolder(target);
    onClose();
  }

  /** Copies the original reference, including line/column suffixes. */
  function handleCopyLink(): void {
    actions?.copyLink(target.href);
    onClose();
  }

  return <>
    <MenuItem disabled={!actions.canOpenFolder(target)} onClick={handleOpenFolder}>
      <ListItemIcon><FolderOpenOutlined fontSize="small" /></ListItemIcon>
      <ListItemText>{t("files.links.openFolder")}</ListItemText>
    </MenuItem>
    <MenuItem onClick={handleCopyLink}>
      <ListItemIcon><ContentCopyOutlined fontSize="small" /></ListItemIcon>
      <ListItemText>{t("files.links.copyLink")}</ListItemText>
    </MenuItem>
  </>;
}

export const FileLinkMenuItemsX = observer(FileLinkMenuItems);
