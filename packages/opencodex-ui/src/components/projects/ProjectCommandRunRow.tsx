/**
 * Renders one running or completed command instance.
 */
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectCommandRunView } from "../../stores/ProjectCommandsStore";

type ProjectCommandRunRowProps = {
  run: ProjectCommandRunView;
  onCloseRun(commandId: string, runId: string): void;
  onOpenLogs(run: ProjectCommandRunView): void;
  onStopRun(runId: string): void;
};

/**
 * Renders one command instance row.
 *
 * @param props Component props.
 * @returns Rendered run row.
 */
export function ProjectCommandRunRow({
  run,
  onCloseRun,
  onOpenLogs,
  onStopRun
}: ProjectCommandRunRowProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const isRunning = run.status === "running";
  const durationMs = readRunDurationMs(run, now);
  const logsColor = readLogsColor(run);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning]);

  function handleAction(): void {
    if (isRunning) {
      onStopRun(run.id);
      return;
    }

    onCloseRun(run.commandId, run.id);
  }

  function handleOpenLogs(): void {
    onOpenLogs(run);
  }

  return (
    <Stack className="project-command-run-row" direction="row" spacing={1}>
      <Tooltip title={isRunning ? t("commands.stopRun") : t("commands.closeRun")}>
        <IconButton size="small" onClick={handleAction}>
          {isRunning ? (
            <StopOutlinedIcon fontSize="small" />
          ) : (
            <CloseOutlinedIcon fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", minWidth: 0 }}>
          <Typography variant="body2" noWrap>
            {isRunning ? t("commands.running") : t(`commands.status.${run.status}`)}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {formatDuration(durationMs)}
          </Typography>
        </Stack>
      </Box>
      <Tooltip title={t("commands.openLogs")}>
        <IconButton size="small" color={logsColor} onClick={handleOpenLogs}>
          <DescriptionOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

function readRunDurationMs(run: ProjectCommandRunView, now: number): number {
  const startedAt = Date.parse(run.startedAt);
  const endedAt = run.exitedAt === null ? now : Date.parse(run.exitedAt);

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    return 0;
  }

  return Math.max(0, endedAt - startedAt);
}

function readLogsColor(
  run: ProjectCommandRunView
): "default" | "primary" | "success" | "error" {
  if (run.status === "running") {
    return "primary";
  }

  if (run.exitCode === 0) {
    return "success";
  }

  if (run.status === "failed" || run.status === "killed" || run.exitCode !== 0) {
    return "error";
  }

  return "default";
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export const ProjectCommandRunRowX = observer(ProjectCommandRunRow);
