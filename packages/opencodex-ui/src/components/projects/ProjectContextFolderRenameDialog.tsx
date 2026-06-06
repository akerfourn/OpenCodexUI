/**
 * Renders a context folder rename dialog.
 */
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from "@mui/material";
import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type ProjectContextFolderRenameDialogProps = {
  currentName: string;
  folderPath: string;
  disabled: boolean;
  open: boolean;
  onClose(): void;
  onSubmit(label: string | null): void;
};

/**
 * Renders a dialog that edits the display name of a context folder.
 *
 * @param props Component props.
 * @returns Rendered rename dialog.
 */
export function ProjectContextFolderRenameDialog({
  currentName,
  folderPath,
  disabled,
  open,
  onClose,
  onSubmit
}: ProjectContextFolderRenameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(currentName);

  useEffect(() => {
    if (open) {
      setValue(currentName);
    }
  }, [currentName, open]);

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setValue(event.target.value);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(value.trim().length > 0 ? value : null);
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>{t("contextFolders.renameTitle")}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            {folderPath}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            disabled={disabled}
            label={t("contextFolders.name")}
            value={value}
            onChange={handleChange}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" disabled={disabled} onClick={onClose}>
            {t("contextFolders.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={disabled}>
            {t("contextFolders.save")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
