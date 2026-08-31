/**
 * Renders Docker Compose services for one opened project.
 */
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectComposeLogsDialogX } from "./ProjectComposeLogsDialog";
import { ProjectComposeServiceDialogX } from "./ProjectComposeServiceDialog";
import { ProjectComposeServiceRowX } from "./ProjectComposeServiceRow";
import { useProjectComposePolling } from "./useProjectComposePolling";

type ProjectComposePanelProps = {
  projectStore: ProjectStore;
};

/** Renders Compose discovery, compact service state, details, and controls. */
export function ProjectComposePanel({ projectStore }: ProjectComposePanelProps) {
  const { t } = useTranslation();
  const composeStore = projectStore.composeStore;

  useProjectComposePolling(composeStore);

  useEffect(() => {
    if (typeof composeStore.invalidateIfUnavailable === "function") {
      composeStore.invalidateIfUnavailable();
    }
  }, [
    composeStore,
    composeStore.isAvailable,
    projectStore.project?.path,
    projectStore.project?.sourceId
  ]);

  useEffect(() => {
    const sourceId = projectStore.project?.sourceId;

    if (sourceId !== null && sourceId !== undefined &&
      composeStore.isAvailable && !composeStore.hasLoaded && !composeStore.isLoading) {
      void composeStore.load();
    }
  }, [
    composeStore,
    composeStore.isAvailable,
    projectStore.project?.path,
    projectStore.project?.sourceId
  ]);

  function handleRefresh(): void {
    void composeStore.load();
  }

  function handleSelect(serviceName: string): void {
    composeStore.selectService(serviceName);
  }

  function handleCloseDetails(): void {
    composeStore.clearSelection();
  }

  function handleStart(serviceName: string): void {
    void composeStore.up(serviceName);
  }

  function handleStop(serviceName: string): void {
    void composeStore.stop(serviceName);
  }

  function handleRestart(serviceName: string): void {
    void composeStore.restart(serviceName);
  }

  function handleLogs(serviceName: string): void {
    void composeStore.openLogs(serviceName);
  }

  const selectedService = composeStore.selectedService;
  const isAvailable = composeStore.isAvailable;
  const serviceRows = composeStore.services.map((service) => (
    <ProjectComposeServiceRowX
      key={service.name}
      service={service}
      isSelected={composeStore.selectedServiceName === service.name}
      onSelect={handleSelect}
    />
  ));
  const isSelectedServicePending = selectedService !== null &&
    composeStore.isServicePending(selectedService.name);

  return (
    <section className="project-compose-panel">
      <Stack className="project-compose-header" direction="row" spacing={1}>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography component="h2" variant="subtitle1">
            {t("docker.compose.title")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("docker.compose.description")}
          </Typography>
          {composeStore.snapshot?.composeFile !== null && composeStore.snapshot?.composeFile !== undefined ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
              {t("docker.compose.composeFile", { file: composeStore.snapshot.composeFile })}
            </Typography>
          ) : null}
        </Box>
        <Tooltip title={t("docker.compose.actions.refresh")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("docker.compose.actions.refresh")}
              disabled={!isAvailable || composeStore.isLoading}
              onClick={handleRefresh}
            >
              <RefreshOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {composeStore.isLoading ? <LinearProgress /> : null}
      {composeStore.errorMessage !== null ? (
        <Alert severity="error" className="project-compose-error">
          {composeStore.errorMessage}
        </Alert>
      ) : null}
      {!isAvailable && projectStore.project?.sourceId !== null &&
      projectStore.project?.sourceId !== undefined ? (
        <Alert severity="warning" className="project-compose-error">
          {t("docker.compose.sourceUnavailable")}
        </Alert>
      ) : null}
      {composeStore.snapshot?.errorMessage !== null && composeStore.snapshot?.errorMessage !== undefined ? (
        <Alert severity="warning" className="project-compose-error">
          {composeStore.snapshot.errorMessage}
        </Alert>
      ) : null}

      <Stack className="project-compose-content" spacing={0.75}>
        {composeStore.isLoading && !composeStore.hasLoaded ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <CircularProgress size={16} />
            <Typography variant="body2" color="text.secondary">
              {t("docker.compose.loading")}
            </Typography>
          </Stack>
        ) : null}
        {composeStore.hasLoaded && composeStore.services.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("docker.compose.empty")}
          </Typography>
        ) : null}
        {serviceRows}
      </Stack>

      <ProjectComposeServiceDialogX
        service={selectedService}
        isPending={isSelectedServicePending}
        isAvailable={isAvailable}
        onClose={handleCloseDetails}
        onStart={handleStart}
        onStop={handleStop}
        onRestart={handleRestart}
        onLogs={handleLogs}
      />
      <ProjectComposeLogsDialogX store={composeStore} />
    </section>
  );
}

export const ProjectComposePanelX = observer(ProjectComposePanel);
