/**
 * Renders a confirmation dialog before removing a context folder.
 */
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

type ProjectContextFolderDeleteDialogProps = {
  folderName: string;
  disabled: boolean;
  open: boolean;
  onClose(): void;
  onConfirm(): void;
};

/**
 * Renders a guarded confirmation before deleting a context folder.
 *
 * @param props Component props.
 * @returns Rendered delete dialog.
 */
export function ProjectContextFolderDeleteDialog({
  folderName,
  disabled,
  open,
  onClose,
  onConfirm
}: ProjectContextFolderDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} maxWidth="xs" fullWidth onClose={onClose}>
      <DialogTitle>{t("contextFolders.deleteTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {t("contextFolders.deleteDescription", { name: folderName })}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button disabled={disabled} onClick={onClose}>
          {t("contextFolders.cancel")}
        </Button>
        <Button color="error" disabled={disabled} onClick={onConfirm}>
          {t("contextFolders.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
