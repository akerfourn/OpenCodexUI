/**
 * Renders Docker Compose service details and actions in a modal.
 */
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import StopOutlinedIcon from "@mui/icons-material/StopOutlined";
import SubjectOutlinedIcon from "@mui/icons-material/SubjectOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

import { ProjectComposeServiceDetails } from "./ProjectComposeServiceDetails";
import { ProjectComposeStatusIndicator } from "./ProjectComposeStatusIndicator";

type ComposeService = OpenCodexDockerComposeSnapshot["services"][number];

type ComposeServiceCapabilities = {
  canStart: boolean;
  canStop: boolean;
  hasContainers: boolean;
};

type ProjectComposeServiceDialogProps = {
  service: ComposeService | null;
  isPending: boolean;
  isAvailable: boolean;
  onClose(): void;
  onStart(serviceName: string): void;
  onStop(serviceName: string): void;
  onRestart(serviceName: string): void;
  onLogs(serviceName: string): void;
};

/** Renders one selected Compose service in a spacious, actionable dialog. */
export function ProjectComposeServiceDialog({
  service,
  isPending,
  isAvailable,
  onClose,
  onStart,
  onStop,
  onRestart,
  onLogs
}: ProjectComposeServiceDialogProps) {
  const { t } = useTranslation();
  const capabilities = readComposeServiceCapabilities(service);

  function handleStart(): void {
    if (service !== null) {
      onStart(service.name);
    }
  }

  function handleStop(): void {
    if (service !== null) {
      onStop(service.name);
    }
  }

  function handleRestart(): void {
    if (service !== null) {
      onRestart(service.name);
    }
  }

  function handleLogs(): void {
    if (service !== null) {
      onLogs(service.name);
    }
  }

  const dialogContent = service === null ? null : (
    <>
      <DialogTitle component="div" className="project-compose-dialog-title">
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", minWidth: 0 }}>
          <ProjectComposeStatusIndicator state={service.state} />
          <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
            <Typography component="h2" variant="h6" noWrap>
              {service.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t(`docker.compose.status.${service.state}`)}
            </Typography>
          </Box>
          <IconButton
            edge="end"
            aria-label={t("docker.compose.closeDetails")}
            onClick={onClose}
          >
            <CloseOutlinedIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers className="project-compose-dialog-content">
        <ProjectComposeServiceDetails service={service} />
      </DialogContent>
      <DialogActions className="project-compose-dialog-actions">
        <Button
          startIcon={<SubjectOutlinedIcon />}
          disabled={!isAvailable || isPending || !capabilities.hasContainers}
          onClick={handleLogs}
        >
          {t("docker.compose.actions.logs")}
        </Button>
        <Box sx={{ flex: "1 1 auto" }} />
        <Button onClick={onClose}>{t("docker.compose.closeDetails")}</Button>
        {capabilities.canStart ? (
          <Button
            variant="contained"
            startIcon={<PlayArrowOutlinedIcon />}
            disabled={!isAvailable || isPending}
            onClick={handleStart}
          >
            {t("docker.compose.actions.start")}
          </Button>
        ) : null}
        {capabilities.canStop ? (
          <>
            <Button
              color="error"
              variant="outlined"
              startIcon={<StopOutlinedIcon />}
              disabled={!isAvailable || isPending}
              onClick={handleStop}
            >
              {t("docker.compose.actions.stop")}
            </Button>
            <Button
              variant="contained"
              startIcon={<RestartAltOutlinedIcon />}
              disabled={!isAvailable || isPending}
              onClick={handleRestart}
            >
              {t("docker.compose.actions.restart")}
            </Button>
          </>
        ) : null}
      </DialogActions>
    </>
  );

  return (
    <Dialog
      open={service !== null}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-label={t("docker.compose.serviceDetails")}
    >
      {dialogContent}
    </Dialog>
  );
}

export const ProjectComposeServiceDialogX = observer(ProjectComposeServiceDialog);

/** Returns the lifecycle actions that are safe for the current service state. */
export function readComposeServiceCapabilities(
  service: ComposeService | null
): ComposeServiceCapabilities {
  return {
    canStart: service?.state === "stopped" || service?.state === "missing",
    canStop: service?.state === "running" ||
      service?.state === "unhealthy" ||
      service?.state === "partial",
    hasContainers: (service?.containers.length ?? 0) > 0
  };
}
