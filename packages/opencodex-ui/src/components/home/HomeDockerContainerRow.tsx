import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import SubjectOutlinedIcon from "@mui/icons-material/SubjectOutlined";
import {
  Chip,
  IconButton,
  Stack,
  TableCell,
  TableRow,
  Tooltip,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexDockerContainer } from "@open-codex-ui/opencodex-protocol";

interface HomeDockerContainerRowProps {
  container: OpenCodexDockerContainer;
  isPending: boolean;
  onLogs(containerId: string): void;
  onRestart(containerId: string): void;
  onStart(containerId: string): void;
  onStop(containerId: string): void;
}

/** Renders one existing Docker container and its safe lifecycle actions. */
export function HomeDockerContainerRow({
  container,
  isPending,
  onLogs,
  onRestart,
  onStart,
  onStop
}: HomeDockerContainerRowProps) {
  const { t } = useTranslation();
  const normalizedState = container.state.toLowerCase();
  const isRunning = normalizedState === "running";
  const canStart = normalizedState === "created" || normalizedState === "exited";
  const canStop = isRunning || normalizedState === "restarting" || normalizedState === "paused";

  function handleStart(): void {
    onStart(container.id);
  }

  function handleStop(): void {
    onStop(container.id);
  }

  function handleRestart(): void {
    onRestart(container.id);
  }

  function handleLogs(): void {
    onLogs(container.id);
  }

  return (
    <TableRow hover>
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{container.name}</Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{container.image}</Typography>
      </TableCell>
      <TableCell>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Chip
            label={container.state}
            color={isRunning ? "success" : "default"}
            size="small"
            variant={isRunning ? "filled" : "outlined"}
          />
          <Typography variant="caption" color="text.secondary">
            {container.status}
          </Typography>
        </Stack>
      </TableCell>
      <TableCell>
        <Typography variant="body2" color="text.secondary">
          {container.ports.length > 0 ? container.ports : "—"}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
          <Tooltip title={t("docker.actions.start")}>
            <span>
              <IconButton
                aria-label={t("docker.actions.start")}
                disabled={isPending || !canStart}
                onClick={handleStart}
                size="small"
              >
                <PlayArrowOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("docker.actions.stop")}>
            <span>
              <IconButton
                aria-label={t("docker.actions.stop")}
                disabled={isPending || !canStop}
                onClick={handleStop}
                size="small"
              >
                <StopOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("docker.actions.restart")}>
            <span>
              <IconButton
                aria-label={t("docker.actions.restart")}
                disabled={isPending || !canStop}
                onClick={handleRestart}
                size="small"
              >
                <RestartAltOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("docker.actions.logs")}>
            <span>
              <IconButton
                aria-label={t("docker.actions.logs")}
                disabled={isPending}
                onClick={handleLogs}
                size="small"
              >
                <SubjectOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}
