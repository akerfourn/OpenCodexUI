import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectGroup } from "@open-codex-ui/opencodex-protocol";

type HomeProjectGroupDeleteDialogProps = {
  group: OpenCodexProjectGroup | null;
  onCancel(): void;
  onConfirm(groupId: string): void;
};

/** Confirms removing a group while keeping its projects. */
export function HomeProjectGroupDeleteDialog({
  group,
  onCancel,
  onConfirm
}: HomeProjectGroupDeleteDialogProps) {
  const { t } = useTranslation();

  function handleConfirm(): void {
    if (group !== null) {
      onConfirm(group.id);
    }
  }

  return (
    <Dialog open={group !== null} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{t("home.deleteProjectGroupTitle", { group: group?.name ?? "" })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t("home.deleteProjectGroupDescription")}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>{t("home.deleteProjectCancel")}</Button>
        <Button onClick={handleConfirm} color="error" variant="contained">
          {t("home.deleteProjectGroupConfirm")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
