/**
 * Renders the rename modal component for the OpenCodex UI.
 */
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";

type RenameModalProps = {
  value: string;
  title: string;
/**
 * Handles on cancel.
 *
 * @returns Nothing.
 */
onCancel(): void;
/**
 * Handles on change.
 *
 * @param value Value to normalize.
 *
 * @returns Nothing.
 */
onChange(value: string): void;
/**
 * Handles on submit.
 *
 * @returns Nothing.
 */
onSubmit(): void;
};

/**
 * Renders the rename modal component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function RenameModal({ value, title, onCancel, onChange, onSubmit }: RenameModalProps) {
  const { t } = useTranslation();

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onCancel}>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>{t("rename.title")}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <TextField value={value} autoFocus fullWidth onChange={handleChange} />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onCancel}>
            {t("rename.cancel")}
          </Button>
          <Button variant="contained" type="submit">
            {t("rename.submit")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
