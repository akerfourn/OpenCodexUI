/**
 * Renders bounded stdout and stderr logs for a Compose service.
 */
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectComposeStore } from "../../stores/project/ProjectComposeStore";

type ProjectComposeLogsDialogProps = {
  store: ProjectComposeStore;
};

/** Displays only the bounded log streams returned for the selected service. */
export function ProjectComposeLogsDialog({ store }: ProjectComposeLogsDialogProps) {
  const { t } = useTranslation();
  const serviceName = store.selectedServiceName ?? "";

  function handleClose(): void {
    store.closeLogs();
  }

  let content = (
    <Typography color="text.secondary">{t("docker.compose.logs.empty")}</Typography>
  );

  if (store.isLoadingLogs) {
    content = <LinearProgress />;
  } else if (store.logsErrorMessage !== null) {
    content = <Alert severity="error">{store.logsErrorMessage}</Alert>;
  } else if (store.selectedLogs !== null) {
    const streams = [
      {
        key: "stdout",
        label: t("docker.compose.logs.stdout"),
        text: store.selectedLogs.stdout,
        truncated: store.selectedLogs.stdoutTruncated
      },
      {
        key: "stderr",
        label: t("docker.compose.logs.stderr"),
        text: store.selectedLogs.stderr,
        truncated: store.selectedLogs.stderrTruncated
      }
    ].filter((stream) => stream.text.length > 0);

    if (streams.length > 0) {
      content = (
        <Stack spacing={2}>
          {streams.map((stream) => (
            <Box key={stream.key}>
              <Typography variant="subtitle2" gutterBottom>{stream.label}</Typography>
              {stream.truncated ? (
                <Alert severity="info" sx={{ mb: 1 }}>{t("docker.compose.logs.truncated")}</Alert>
              ) : null}
              <Box
                component="pre"
                sx={{
                  backgroundColor: "action.hover",
                  borderRadius: 1,
                  fontFamily: "monospace",
                  fontSize: "0.8rem",
                  m: 0,
                  maxHeight: "45vh",
                  overflow: "auto",
                  p: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word"
                }}
              >
                {stream.text}
              </Box>
            </Box>
          ))}
        </Stack>
      );
    }
  }

  return (
    <Dialog
      open={store.isLogsOpen}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
    >
      <DialogTitle>{t("docker.compose.logs.title", { service: serviceName })}</DialogTitle>
      <DialogContent dividers>{content}</DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("docker.compose.logs.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectComposeLogsDialogX = observer(ProjectComposeLogsDialog);
