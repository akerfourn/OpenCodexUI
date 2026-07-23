import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField
} from "@mui/material";
import { useTranslation } from "react-i18next";

type HomeProjectGroupDialogProps = {
  open: boolean;
  mode: "create" | "rename";
  initialName?: string;
  onCancel(): void;
  onConfirm(name: string): void;
};

/** Renders the create/rename dialog for a project group. */
export function HomeProjectGroupDialog({
  open,
  mode,
  initialName = "",
  onCancel,
  onConfirm
}: HomeProjectGroupDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) {
      setName(initialName);
    }
  }, [initialName, open]);

  function handleSubmit(): void {
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      return;
    }

    onConfirm(normalizedName);
  }

  const title = mode === "create" ? t("home.createProjectGroup") : t("home.renameProjectGroup");

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t("home.projectGroupName")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSubmit();
            }
          }}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("home.deleteProjectCancel")}</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={name.trim().length === 0}>
          {t("home.saveChanges")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
