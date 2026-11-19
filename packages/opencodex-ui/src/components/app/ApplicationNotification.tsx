import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Alert, Button, IconButton, Snackbar, Stack } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";

/** One global notification surface; full diagnostics remain in the application journal. */
export function ApplicationNotification({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const error = store.appStore.errorMessage;
  const message = error ?? store.appStore.warningMessage;
  let summary = message?.split("\n")[0] ?? "";
  if (error !== null) summary = t("logs.errorOccurred");
  if (error?.split("\n")[0]?.endsWith("Finish active conversations and sub-agents on this source before workspace maintenance.")) {
    summary = t("workspaces.sourceActive");
  } else if (error?.split("\n")[0]?.endsWith("Workspace contains modified, untracked or ignored files. Save or remove them before deleting it.")) {
    summary = t("workspaces.removeDirty");
  }

  /** Dismisses the current notification while retaining its journal entry. */
  function dismiss(): void {
    if (error !== null) store.appStore.clearErrorMessage();
    else store.appStore.clearWarningMessage();
  }

  /** Leaves click-away events alone so opening a dialog does not consume its failure notice. */
  function handleClose(_event: unknown, reason?: string): void {
    if (reason !== "clickaway") dismiss();
  }

  /** Opens persistent diagnostics from the same control for every feature. */
  function handleOpenLogs(): void {
    store.openLogsHome();
    store.appStore.clearErrorMessage();
    store.appStore.clearWarningMessage();
  }

  const action = <Stack direction="row" sx={{ alignItems: "center" }}>
    <Button color="inherit" size="small" onClick={handleOpenLogs}>{t("logs.viewLogs")}</Button>
    <IconButton color="inherit" size="small" onClick={dismiss} aria-label={t("updates.dismiss")}>
      <CloseOutlinedIcon fontSize="small" />
    </IconButton>
  </Stack>;
  const severity = error === null ? "warning" : "error";
  return <Snackbar key={message} open={message !== null} autoHideDuration={8000} onClose={handleClose}
    sx={{ maxWidth: "min(640px, calc(100vw - 32px))" }}>
    <Alert severity={severity} variant="filled" action={action}
      sx={{ width: "100%", alignItems: "center", "& .MuiAlert-message": { overflowWrap: "anywhere" } }}>
      {summary}
    </Alert>
  </Snackbar>;
}

export const ApplicationNotificationX = observer(ApplicationNotification);
