/**
 * Renders the local project task deletion confirmation dialog.
 */
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type ProjectTaskDeleteDialogProps = {
  open: boolean;
  isSaving: boolean;
  onCancel(): void;
  onConfirm(): void;
};

/**
 * Renders a confirmation before deleting a task.
 *
 * @param props Component props.
 *
 * @returns Rendered confirmation dialog.
 */
export function ProjectTaskDeleteDialog({
  open,
  isSaving,
  onCancel,
  onConfirm
}: ProjectTaskDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{t("tasks.deleteTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{t("tasks.deleteDescription")}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("tasks.cancel")}</Button>
        <Button color="error" variant="contained" disabled={isSaving} onClick={onConfirm}>
          {t("tasks.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
