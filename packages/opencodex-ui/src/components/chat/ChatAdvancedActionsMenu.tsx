/**
 * Renders advanced chat actions behind a compact overflow menu.
 */
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type ChatAdvancedAction = "review" | "compact";

type ChatAdvancedActionsMenuProps = {
  disabled: boolean;
  attachImagesDisabled: boolean;
  onReview(): void;
  onCompact(): void;
  onAttachImages(): void;
};

/**
 * Renders advanced chat actions with confirmation before execution.
 *
 * @param props Component props.
 * @returns Rendered menu.
 */
export function ChatAdvancedActionsMenu({
  disabled,
  onReview,
  onCompact,
  attachImagesDisabled,
  onAttachImages
}: ChatAdvancedActionsMenuProps) {
  const { t } = useTranslation();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [pendingAction, setPendingAction] = useState<ChatAdvancedAction | null>(null);
  const isMenuOpen = anchorElement !== null;
  const isMenuDisabled = disabled && attachImagesDisabled;

  function handleOpenMenu(event: React.MouseEvent<HTMLButtonElement>): void {
    setAnchorElement(event.currentTarget);
  }

  function handleCloseMenu(): void {
    setAnchorElement(null);
  }

  function handleSelectAction(action: ChatAdvancedAction): void {
    setPendingAction(action);
    handleCloseMenu();
  }

  function handleAttachImages(): void {
    handleCloseMenu();
    onAttachImages();
  }

  function handleCancel(): void {
    setPendingAction(null);
  }

  function handleConfirm(): void {
    const action = pendingAction;
    setPendingAction(null);

    if (action === "review") {
      onReview();
      return;
    }

    if (action === "compact") {
      onCompact();
    }
  }

  const titleKey = pendingAction === "compact"
    ? "composer.advanced.compactTitle"
    : "composer.advanced.reviewTitle";
  const descriptionKey = pendingAction === "compact"
    ? "composer.advanced.compactDescription"
    : "composer.advanced.reviewDescription";

  return (
    <>
      <Tooltip title={t("composer.advanced.open")}>
        <span>
          <IconButton
            type="button"
            aria-label={t("composer.advanced.open")}
            disabled={isMenuDisabled}
            onClick={handleOpenMenu}
          >
            <MoreVertIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        anchorEl={anchorElement}
        open={isMenuOpen}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        onClose={handleCloseMenu}
      >
        <MenuItem disabled={attachImagesDisabled} onClick={handleAttachImages}>
          <ListItemIcon>
            <AddPhotoAlternateOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("composer.attachImage")}</ListItemText>
        </MenuItem>
        <MenuItem disabled={disabled} onClick={() => handleSelectAction("review")}>
          <ListItemIcon>
            <RateReviewOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("composer.advanced.review")}</ListItemText>
        </MenuItem>
        <MenuItem disabled={disabled} onClick={() => handleSelectAction("compact")}>
          <ListItemIcon>
            <CompressOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t("composer.advanced.compact")}</ListItemText>
        </MenuItem>
      </Menu>
      <Dialog open={pendingAction !== null} onClose={handleCancel}>
        <DialogTitle>{t(titleKey)}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t(descriptionKey)}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={handleCancel}>
            {t("composer.advanced.cancel")}
          </Button>
          <Button type="button" variant="contained" onClick={handleConfirm}>
            {t("composer.advanced.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
