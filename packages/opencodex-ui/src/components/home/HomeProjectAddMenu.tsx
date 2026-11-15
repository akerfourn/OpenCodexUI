import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip } from "@mui/material";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

interface HomeProjectAddMenuProps {
  disabled: boolean;
  onOpenExisting(): void;
  onCreateNew(): void;
  onClone(): void;
}

/** Offers explicit opening, blank creation, and Git import from one compact action. */
export function HomeProjectAddMenu({ disabled, onOpenExisting, onCreateNew, onClone }: HomeProjectAddMenuProps) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /** Anchors the menu to the add-project button. */
  function handleOpen(event: MouseEvent<HTMLElement>): void { setAnchor(event.currentTarget); }
  /** Dismisses the menu without creating a project. */
  function handleClose(): void { setAnchor(null); }
  /** Opens the existing folder workflow after dismissing the menu. */
  function handleExisting(): void { handleClose(); onOpenExisting(); }
  /** Creates a blank project only after the explicit menu choice. */
  function handleNew(): void { handleClose(); onCreateNew(); }
  /** Opens import details without starting a clone automatically. */
  function handleClone(): void { handleClose(); onClone(); }
  return <>
    <Tooltip title={t("home.addProject")}>
      <span><IconButton color="primary" aria-label={t("home.addProject")} disabled={disabled} onClick={handleOpen}
        aria-haspopup="menu" aria-expanded={anchor !== null} aria-controls="home-project-add-menu">
        <AddOutlinedIcon />
      </IconButton></span>
    </Tooltip>
    <Menu id="home-project-add-menu" anchorEl={anchor} open={anchor !== null} onClose={handleClose}>
      <MenuItem disabled={disabled} onClick={handleExisting}>
        <ListItemIcon><FolderOpenOutlinedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t("home.addExistingProject")}</ListItemText>
      </MenuItem>
      <MenuItem disabled={disabled} onClick={handleNew}>
        <ListItemIcon><CreateNewFolderOutlinedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t("home.addBlankProject")}</ListItemText>
      </MenuItem>
      <MenuItem disabled={disabled} onClick={handleClone}>
        <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
        <ListItemText>{t("home.addGitProject")}</ListItemText>
      </MenuItem>
    </Menu>
  </>;
}
