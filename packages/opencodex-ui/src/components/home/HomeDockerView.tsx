import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { HomeDockerContainerRow } from "./HomeDockerContainerRow";
import { HomeDockerLogsDialogX } from "./HomeDockerLogsDialog";

interface HomeDockerViewProps {
  store: RootStore;
}

/** Renders safe controls for existing containers in the host Docker context. */
export function HomeDockerView({ store }: HomeDockerViewProps) {
  const { t } = useTranslation();
  const dockerStore = store.dockerHostStore;

  useEffect(() => {
    if (!dockerStore.hasLoaded && !dockerStore.isLoading) {
      void dockerStore.load();
    }
  }, [dockerStore]);

  function handleRefresh(): void {
    void dockerStore.load();
  }

  function handleStart(containerId: string): void {
    void dockerStore.start(containerId);
  }

  function handleStop(containerId: string): void {
    void dockerStore.stop(containerId);
  }

  function handleRestart(containerId: string): void {
    void dockerStore.restart(containerId);
  }

  function handleLogs(containerId: string): void {
    void dockerStore.openLogs(containerId);
  }

  let content: ReactNode = null;
  const snapshot = dockerStore.snapshot;

  if (snapshot?.availability.available === false) {
    content = (
      <Alert severity="warning">
        <Typography variant="subtitle2">{t("docker.unavailableTitle")}</Typography>
        <Typography variant="body2">{snapshot.availability.message}</Typography>
      </Alert>
    );
  } else if (snapshot?.availability.available === true) {
    if (snapshot.containers.length > 0) {
      content = (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("docker.columns.name")}</TableCell>
                <TableCell>{t("docker.columns.image")}</TableCell>
                <TableCell>{t("docker.columns.status")}</TableCell>
                <TableCell>{t("docker.columns.ports")}</TableCell>
                <TableCell align="right">{t("docker.columns.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {snapshot.containers.map((container) => (
                <HomeDockerContainerRow
                  key={container.id}
                  container={container}
                  isPending={dockerStore.isContainerPending(container.id)}
                  onLogs={handleLogs}
                  onRestart={handleRestart}
                  onStart={handleStart}
                  onStop={handleStop}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      );
    } else {
      content = (
        <Typography color="text.secondary">{t("docker.empty")}</Typography>
      );
    }
  }

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Box sx={{ flex: "1 1 auto" }}>
          <Typography variant="h4" component="h2">{t("docker.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("docker.description")}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<RefreshOutlinedIcon />}
          disabled={dockerStore.isLoading}
          onClick={handleRefresh}
        >
          {t("docker.refresh")}
        </Button>
      </Stack>

      {dockerStore.isLoading ? <LinearProgress /> : null}
      {dockerStore.errorMessage !== null && dockerStore.selectedContainerId === null ? (
        <Alert severity="error">{dockerStore.errorMessage}</Alert>
      ) : null}

      {snapshot?.availability.available === true ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip
            size="small"
            color="success"
            label={t("docker.serverVersion", { version: snapshot.availability.serverVersion })}
          />
          <Typography variant="caption" color="text.secondary">
            {t("docker.containerCount", { count: snapshot.containers.length })}
          </Typography>
        </Stack>
      ) : null}

      {content}
      <HomeDockerLogsDialogX store={dockerStore} />
    </Stack>
  );
}

export const HomeDockerViewX = observer(HomeDockerView);
