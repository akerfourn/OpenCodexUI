import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { CopyIconButton } from "../common/CopyIconButton";

/** Shows plain updater diagnostics without interpreting remote error content as markup. */
export function AppUpdateErrorDialog({ open, message, onClose }: {
  open: boolean;
  message: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="update-error-title">
      <DialogTitle id="update-error-title">
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Box sx={{ flex: 1 }}>{t("updates.errorDetails")}</Box>
          <CopyIconButton value={message} label={t("logs.copy")} copiedLabel={t("message.copied")} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Typography component="pre" variant="body2"
          sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: "60vh", overflow: "auto", m: 0 }}>
          {message}
        </Typography>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t("updates.dismiss")}</Button></DialogActions>
    </Dialog>
  );
}
