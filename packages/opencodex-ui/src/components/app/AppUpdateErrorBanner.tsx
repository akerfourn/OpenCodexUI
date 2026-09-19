import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Alert, Button, IconButton, Stack, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppUpdateStore } from "../../stores/app/AppUpdateStore";
import { AppUpdateErrorDialog } from "./AppUpdateErrorDialog";

/** Displays a dismissible update failure while keeping diagnostics in a separate dialog. */
function AppUpdateErrorBanner({ store }: { store: AppUpdateStore }) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(false);

  /** Opens the unmodified updater error for inspection and copying. */
  function handleDetails(): void { setDetailsOpen(true); }
  /** Closes the diagnostic dialog. */
  function handleCloseDetails(): void { setDetailsOpen(false); }
  /** Hides this error until a new update attempt or state arrives. */
  function handleDismiss(): void { store.dismissError(); }
  /** Runs a fresh provider check. */
  function handleRetry(): void { void store.check(); }

  if (store.isErrorDismissed) {
    return null;
  }

  const actions = (
    <Stack direction="row" spacing={0.5}>
      <Tooltip title={t("updates.retry")}>
        <span>
          <IconButton color="inherit" size="small" aria-label={t("updates.retry")}
            disabled={store.isChecking} onClick={handleRetry}>
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={t("updates.dismiss")}>
        <IconButton color="inherit" size="small" aria-label={t("updates.dismiss")} onClick={handleDismiss}>
          <CloseOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  return (
    <>
      <Alert severity="error" action={actions}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <span>{t("updates.error")}</span>
          <Button color="inherit" size="small" onClick={handleDetails}>{t("updates.details")}</Button>
        </Stack>
      </Alert>
      <AppUpdateErrorDialog open={detailsOpen} message={store.state.errorMessage ?? ""}
        onClose={handleCloseDetails} />
    </>
  );
}

export const AppUpdateErrorBannerX = observer(AppUpdateErrorBanner);
