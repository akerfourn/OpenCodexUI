/**
 * Renders the expanded details for one Docker Compose service.
 */
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import SubjectOutlinedIcon from "@mui/icons-material/SubjectOutlined";
import { Button, Divider, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

type ComposeService = OpenCodexDockerComposeSnapshot["services"][number];

type ProjectComposeServiceDetailsProps = {
  service: ComposeService;
  isPending: boolean;
  isAvailable?: boolean;
  detailsId?: string;
  onStart(serviceName: string): void;
  onStop(serviceName: string): void;
  onRestart(serviceName: string): void;
  onLogs(serviceName: string): void;
};

/** Renders service containers, health, ports, and lifecycle actions. */
export function ProjectComposeServiceDetails({
  service,
  isPending,
  isAvailable = true,
  detailsId,
  onStart,
  onStop,
  onRestart,
  onLogs
}: ProjectComposeServiceDetailsProps) {
  const { t } = useTranslation();
  const canStart = service.state === "stopped" || service.state === "missing";
  const canStop = service.state === "running" ||
    service.state === "unhealthy" ||
    service.state === "partial";

  function handleStart(): void {
    onStart(service.name);
  }

  function handleStop(): void {
    onStop(service.name);
  }

  function handleRestart(): void {
    onRestart(service.name);
  }

  function handleLogs(): void {
    onLogs(service.name);
  }

  const startAction = canStart ? (
    <Button
      size="small"
      variant="outlined"
      startIcon={<PlayArrowOutlinedIcon />}
      disabled={!isAvailable || isPending}
      onClick={handleStart}
    >
      {t("docker.compose.actions.start")}
    </Button>
  ) : null;
  const lifecycleActions = canStop ? (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<StopOutlinedIcon />}
        disabled={!isAvailable || isPending}
        onClick={handleStop}
      >
        {t("docker.compose.actions.stop")}
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<RestartAltOutlinedIcon />}
        disabled={!isAvailable || isPending}
        onClick={handleRestart}
      >
        {t("docker.compose.actions.restart")}
      </Button>
    </>
  ) : null;

  return (
    <Stack
      id={detailsId}
      className="project-compose-service-details"
      role="region"
      aria-labelledby={detailsId === undefined ? undefined : `${detailsId}-heading`}
      spacing={1}
    >
      <Typography
        id={detailsId === undefined ? undefined : `${detailsId}-heading`}
        component="h3"
        variant="subtitle2"
      >
        {service.name}
      </Typography>
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap" }}>
        {startAction}
        {lifecycleActions}
        <Button
          size="small"
          variant="outlined"
          startIcon={<SubjectOutlinedIcon />}
          disabled={!isAvailable || isPending}
          onClick={handleLogs}
        >
          {t("docker.compose.actions.logs")}
        </Button>
      </Stack>
      {service.containers.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          {t("docker.compose.noContainers")}
        </Typography>
      ) : service.containers.map((container) => (
        <Stack key={container.name} spacing={0.4} className="project-compose-container">
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {container.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("docker.compose.state")}: {container.state}
            {container.health.length > 0 ? ` · ${t("docker.compose.health")}: ${container.health}` : ""}
            {container.exitCode !== null ? ` · ${t("docker.compose.exitCode", { code: container.exitCode })}` : ""}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("docker.compose.ports")}: {formatPublishers(container.publishers)}
          </Typography>
        </Stack>
      ))}
      <Divider />
    </Stack>
  );
}

/** Formats published ports without exposing an unbounded backend value. */
function formatPublishers(publishers: ComposeService["containers"][number]["publishers"]): string {
  if (publishers.length === 0) {
    return "—";
  }

  return publishers.map((publisher) => {
    const host = publisher.url.length > 0 ? publisher.url : "localhost";
    return `${host}:${publisher.publishedPort}->${publisher.targetPort}/${publisher.protocol}`;
  }).join(", ");
}

export const ProjectComposeServiceDetailsX = observer(ProjectComposeServiceDetails);
