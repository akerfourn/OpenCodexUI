/** Renders the deletion confirmation for an unlaunched project goal. */
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type ProjectGoalDeleteDialogProps = {
  open: boolean;
  isSaving: boolean;
  onCancel(): void;
  onConfirm(): void;
};

/** Confirms permanent deletion of a draft goal. */
export function ProjectGoalDeleteDialog({
  open,
  isSaving,
  onCancel,
  onConfirm
}: ProjectGoalDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{t("goals.deleteTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{t("goals.deleteDescription")}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("goals.cancel")}</Button>
        <Button color="error" variant="contained" disabled={isSaving} onClick={onConfirm}>
          {t("goals.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
