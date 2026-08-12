import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

type DeleteSourceDialogProps = {
  open: boolean;
  associatedProjectCount: number;
  isConfirmed: boolean;
  isDeleting: boolean;
  onConfirmationToggle(): void;
  onCancel(): void;
  onConfirm(): void;
};

/** Renders the explicit confirmation required before deleting an associated source. */
export function DeleteSourceDialog({
  open,
  associatedProjectCount,
  isConfirmed,
  isDeleting,
  onConfirmationToggle,
  onCancel,
  onConfirm
}: DeleteSourceDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onCancel}>
      <DialogTitle>{t("sources.deleteTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t("sources.deleteDescription", { count: associatedProjectCount })}
        </Typography>
        <FormControlLabel
          control={<Checkbox checked={isConfirmed} onChange={onConfirmationToggle} />}
          label={t("sources.deleteConfirmCheckbox")}
        />
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onCancel}>
          {t("sources.cancel")}
        </Button>
        <Button
          type="button"
          variant="contained"
          color="error"
          disabled={!isConfirmed || isDeleting}
          onClick={onConfirm}
        >
          {t("sources.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
