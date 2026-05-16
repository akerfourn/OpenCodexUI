/**
 * Renders the project command deletion confirmation dialog.
 */
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
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ProjectCommandDeleteDialogProps = {
  commandName: string;
  disabled: boolean;
  open: boolean;
  onClose(): void;
  onConfirm(): void;
};

/**
 * Renders a guarded confirmation before deleting a project command.
 *
 * @param props Component props.
 * @returns Rendered delete dialog.
 */
export function ProjectCommandDeleteDialog({
  commandName,
  disabled,
  open,
  onClose,
  onConfirm
}: ProjectCommandDeleteDialogProps) {
  const { t } = useTranslation();
  const [isConfirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmed(false);
    }
  }, [open]);

  function handleConfirmedChange(event: ChangeEvent<HTMLInputElement>): void {
    setConfirmed(event.target.checked);
  }

  return (
    <Dialog open={open} maxWidth="xs" fullWidth onClose={onClose}>
      <DialogTitle>{t("commands.deleteTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">
          {t("commands.deleteDescription", { name: commandName })}
        </Typography>
        <FormControlLabel
          control={(
            <Checkbox
              checked={isConfirmed}
              disabled={disabled}
              onChange={handleConfirmedChange}
            />
          )}
          label={t("commands.deleteConfirmCheckbox")}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("commands.cancel")}</Button>
        <Button
          color="error"
          disabled={!isConfirmed || disabled}
          onClick={onConfirm}
        >
          {t("commands.delete")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
