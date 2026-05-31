/**
 * Renders advanced chat actions behind a compact overflow menu.
 */
import MoreVertIcon from "@mui/icons-material/MoreVert";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Tooltip
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export type ChatAdvancedAction = "review" | "compact";

type ChatAdvancedActionsMenuProps = {
  disabled: boolean;
  canExportLastTurn: boolean;
  onReview(): void;
  onCompact(): void;
  onExportLastTurn(): void;
};

/**
 * Renders advanced chat actions with confirmation before execution.
 *
 * @param props Component props.
 * @returns Rendered menu.
 */
export function ChatAdvancedActionsMenu({
  disabled,
  canExportLastTurn,
  onReview,
  onCompact,
  onExportLastTurn
}: ChatAdvancedActionsMenuProps) {
  const { t } = useTranslation();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [pendingAction, setPendingAction] = useState<ChatAdvancedAction | null>(null);
  const isMenuOpen = anchorElement !== null;

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

  function handleExportLastTurn(): void {
    onExportLastTurn();
    handleCloseMenu();
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
            disabled={disabled && !canExportLastTurn}
            onClick={handleOpenMenu}
          >
            <MoreVertIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Menu
        anchorEl={anchorElement}
        open={isMenuOpen}
        onClose={handleCloseMenu}
      >
        <MenuItem disabled={disabled} onClick={() => handleSelectAction("review")}>
          {t("composer.advanced.review")}
        </MenuItem>
        <MenuItem disabled={disabled} onClick={() => handleSelectAction("compact")}>
          {t("composer.advanced.compact")}
        </MenuItem>
        <MenuItem disabled={!canExportLastTurn} onClick={handleExportLastTurn}>
          {t("composer.advanced.exportLastTurn")}
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
