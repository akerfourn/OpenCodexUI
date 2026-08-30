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

import type { DockerHostStore } from "../../stores/app/DockerHostStore";

interface HomeDockerLogsDialogProps {
  store: DockerHostStore;
}

/** Renders bounded stdout and stderr logs for the selected container. */
export function HomeDockerLogsDialog({ store }: HomeDockerLogsDialogProps) {
  const { t } = useTranslation();
  const container = store.snapshot?.containers.find(
    (entry) => entry.id === store.selectedContainerId
  );
  const title = t("docker.logs.title", { container: container?.name ?? "" });

  function handleClose(): void {
    store.closeLogs();
  }

  let content = (
    <Typography color="text.secondary">{t("docker.logs.empty")}</Typography>
  );

  if (store.isLoadingLogs) {
    content = <LinearProgress />;
  } else if (store.logsErrorMessage !== null) {
    content = <Alert severity="error">{store.logsErrorMessage}</Alert>;
  } else if (store.selectedLogs !== null) {
    const streams = [
      {
        key: "stdout",
        label: t("docker.logs.stdout"),
        text: store.selectedLogs.stdout,
        truncated: store.selectedLogs.stdoutTruncated
      },
      {
        key: "stderr",
        label: t("docker.logs.stderr"),
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
                <Alert severity="info" sx={{ mb: 1 }}>{t("docker.logs.truncated")}</Alert>
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
      open={store.selectedContainerId !== null}
      onClose={handleClose}
      fullWidth
      maxWidth="lg"
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>{content}</DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("docker.logs.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const HomeDockerLogsDialogX = observer(HomeDockerLogsDialog);
