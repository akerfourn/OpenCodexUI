/**
 * Renders detailed runtime information for one Docker Compose service.
 */
import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

type ComposeService = OpenCodexDockerComposeSnapshot["services"][number];
type ComposeContainer = ComposeService["containers"][number];

type ProjectComposeServiceDetailsProps = {
  service: ComposeService;
};

/** Renders service and container state without exposing sensitive Docker data. */
export function ProjectComposeServiceDetails({
  service
}: ProjectComposeServiceDetailsProps) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2.5}>
      <Box className="project-compose-dialog-summary">
        <Box>
          <Typography variant="overline" color="text.secondary">
            {t("docker.compose.state")}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {t(`docker.compose.status.${service.state}`)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="overline" color="text.secondary">
            {t("docker.compose.containers")}
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {t("docker.compose.containerCount", { count: service.containers.length })}
          </Typography>
        </Box>
      </Box>

      {service.containers.length === 0 ? (
        <Paper variant="outlined" className="project-compose-empty-containers">
          <Typography color="text.secondary">
            {t("docker.compose.noContainers")}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {service.containers.map((container) => (
            <ComposeContainerCard key={container.name} container={container} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

type ComposeContainerCardProps = {
  container: ComposeContainer;
};

/** Renders one container using the bounded display DTO from the backend. */
function ComposeContainerCard({ container }: ComposeContainerCardProps) {
  const { t } = useTranslation();
  const healthLabel = translateHealth(container.health, t);
  const stateLabel = translateContainerState(container.state, t);

  return (
    <Paper variant="outlined" className="project-compose-container-card">
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="subtitle1" sx={{ flex: "1 1 auto", fontWeight: 600 }}>
          {container.name}
        </Typography>
        <Chip size="small" variant="outlined" label={stateLabel} />
        {healthLabel === null ? null : (
          <Chip
            size="small"
            color={readHealthColor(container.health)}
            variant="outlined"
            label={healthLabel}
          />
        )}
      </Stack>

      <Box component="dl" className="project-compose-container-metadata">
        <Typography component="dt" variant="caption" color="text.secondary">
          {t("docker.compose.state")}
        </Typography>
        <Typography component="dd" variant="body2">
          {stateLabel}
        </Typography>
        <Typography component="dt" variant="caption" color="text.secondary">
          {t("docker.compose.health")}
        </Typography>
        <Typography component="dd" variant="body2">
          {healthLabel ?? "—"}
        </Typography>
        <Typography component="dt" variant="caption" color="text.secondary">
          {t("docker.compose.exitCodeLabel")}
        </Typography>
        <Typography component="dd" variant="body2">
          {container.exitCode}
        </Typography>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary">
          {t("docker.compose.ports")}
        </Typography>
        {container.publishers.length === 0 ? (
          <Typography variant="body2">{t("docker.compose.noPublishedPorts")}</Typography>
        ) : (
          <Stack component="ul" spacing={0.5} className="project-compose-port-list">
            {container.publishers.map((publisher, index) => (
              <Typography
                component="li"
                variant="body2"
                key={`${publisher.url}-${publisher.publishedPort}-${publisher.targetPort}-${index}`}
              >
                <Box component="code" className="project-compose-port">
                  {formatPublisher(publisher)}
                </Box>
              </Typography>
            ))}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}

/** Formats one published port without combining unrelated bindings. */
function formatPublisher(publisher: ComposeContainer["publishers"][number]): string {
  const host = publisher.url.length > 0 ? publisher.url : "localhost";
  return `${host}:${publisher.publishedPort} → ${publisher.targetPort}/${publisher.protocol}`;
}

/** Translates the finite container states currently reported by Compose. */
function translateContainerState(
  state: string,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  switch (state.toLowerCase()) {
    case "created":
      return t("docker.compose.containerState.created");
    case "running":
      return t("docker.compose.containerState.running");
    case "restarting":
      return t("docker.compose.containerState.restarting");
    case "removing":
      return t("docker.compose.containerState.removing");
    case "paused":
      return t("docker.compose.containerState.paused");
    case "exited":
      return t("docker.compose.containerState.exited");
    case "dead":
      return t("docker.compose.containerState.dead");
    default:
      return state.length > 0 ? state : t("docker.compose.status.unknown");
  }
}

/** Translates a known health state while preserving future Docker values. */
function translateHealth(
  health: string,
  t: ReturnType<typeof useTranslation>["t"]
): string | null {
  switch (health.toLowerCase()) {
    case "healthy":
      return t("docker.compose.healthStatus.healthy");
    case "unhealthy":
      return t("docker.compose.healthStatus.unhealthy");
    case "starting":
      return t("docker.compose.healthStatus.starting");
    case "":
      return null;
    default:
      return health;
  }
}

/** Selects a semantic chip color for known health states. */
function readHealthColor(health: string): "success" | "warning" | "error" | "default" {
  switch (health.toLowerCase()) {
    case "healthy":
      return "success";
    case "starting":
      return "warning";
    case "unhealthy":
      return "error";
    default:
      return "default";
  }
}
