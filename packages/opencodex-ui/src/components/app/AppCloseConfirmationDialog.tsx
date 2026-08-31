/** Renders the application-close confirmation inside the OpenCodexUI renderer. */
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexApplicationCloseRequest } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type AppCloseConfirmationDialogProps = {
  store: RootStore;
};

/**
 * Renders a localized confirmation dialog for native application-close requests.
 *
 * @param props Root store containing the pending native close request.
 * @returns Rendered close confirmation dialog.
 */
export function AppCloseConfirmationDialog({ store }: AppCloseConfirmationDialogProps) {
  const { t } = useTranslation();
  const request = store.applicationCloseRequest ?? null;
  const isOpen = request !== null;
  const hasActiveTurns = request?.hasActiveTurns === true;
  const hasPendingProjectActivity = request?.hasPendingProjectActivity === true;
  const hasPendingWork = hasActiveTurns || hasPendingProjectActivity;
  const alerts = buildActivityAlerts(
    t,
    hasActiveTurns,
    hasPendingProjectActivity
  );
  const body = alerts.length > 0 ? (
    <Stack spacing={1.5}>{alerts}</Stack>
  ) : (
    <Box className="app-close-confirmation-empty">
      <InfoOutlinedIcon color="primary" />
      <Typography color="text.secondary" variant="body2">
        {t("closeConfirmation.noPendingWork")}
      </Typography>
    </Box>
  );
  const confirmLabel = hasPendingWork
    ? t("closeConfirmation.quitAnyway")
    : t("closeConfirmation.quit");
  const titleIcon = hasPendingWork
    ? <WarningAmberOutlinedIcon color="warning" />
    : <InfoOutlinedIcon color="primary" />;

  function handleCancel(): void {
    store.respondToApplicationClose(false);
  }

  function handleConfirm(): void {
    store.respondToApplicationClose(true);
  }

  return (
    <Dialog
      open={isOpen}
      fullWidth
      maxWidth="sm"
      onClose={handleCancel}
      aria-labelledby="app-close-confirmation-title"
    >
      <DialogTitle id="app-close-confirmation-title" sx={{ pb: 1.5, pt: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
          <Box className="app-close-confirmation-icon">{titleIcon}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="div" variant="h6">
              {t("closeConfirmation.title")}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {t("closeConfirmation.description")}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
        {body}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5 }}>
        <Button onClick={handleCancel}>{t("common.cancel")}</Button>
        <Button
          color={hasPendingWork ? "warning" : "primary"}
          variant="contained"
          onClick={handleConfirm}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const AppCloseConfirmationDialogX = observer(AppCloseConfirmationDialog);

/** Builds the warning cards displayed for the current close context. */
function buildActivityAlerts(
  t: (key: string) => string,
  hasActiveTurns: boolean,
  hasPendingProjectActivity: boolean
): ReactElement[] {
  const alerts: ReactElement[] = [];

  if (hasActiveTurns) {
    alerts.push(
      <Alert key="active-turns" severity="warning" icon={<WarningAmberOutlinedIcon />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t("closeConfirmation.activeTurns")}
        </Typography>
        <Typography variant="body2">
          {t("closeConfirmation.activeTurnsDetail")}
        </Typography>
      </Alert>
    );
  }

  if (hasPendingProjectActivity) {
    alerts.push(
      <Alert key="project-activity" severity="info" icon={<InfoOutlinedIcon />}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t("closeConfirmation.pendingProjectActivity")}
        </Typography>
        <Typography variant="body2">
          {t("closeConfirmation.pendingProjectActivityDetail")}
        </Typography>
      </Alert>
    );
  }

  return alerts;
}
