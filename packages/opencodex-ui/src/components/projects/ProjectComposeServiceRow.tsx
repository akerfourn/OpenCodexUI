/**
 * Renders one compact Docker Compose service row.
 */
import { Box, ButtonBase, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

type ComposeService = OpenCodexDockerComposeSnapshot["services"][number];

type ProjectComposeServiceRowProps = {
  service: ComposeService;
  isSelected: boolean;
  detailsId?: string;
  onSelect(serviceName: string): void;
};

const statusColors: Record<ComposeService["state"], string> = {
  running: "#56d364",
  unhealthy: "#f85149",
  partial: "#d29922",
  stopped: "#8b949e",
  missing: "#8b949e",
  unknown: "#8b949e"
};

/** Renders one service with a text-and-color status and expandable details. */
export function ProjectComposeServiceRow({
  service,
  isSelected,
  detailsId,
  onSelect
}: ProjectComposeServiceRowProps) {
  const { t } = useTranslation();
  const statusLabel = t(`docker.compose.status.${service.state}`);

  function handleSelect(): void {
    onSelect(service.name);
  }

  return (
    <Box
      className={isSelected ? "project-compose-service-row is-selected" : "project-compose-service-row"}
      sx={{ borderColor: isSelected ? "var(--vscode-focusBorder)" : undefined }}
    >
      <ButtonBase
        className="project-compose-service-select"
        aria-expanded={isSelected}
        aria-controls={isSelected ? detailsId : undefined}
        aria-label={`${service.name}: ${statusLabel}`}
        onClick={handleSelect}
      >
        <Box
          aria-hidden="true"
          className="project-compose-status-indicator"
          sx={{ backgroundColor: statusColors[service.state] }}
        />
        <Box sx={{ minWidth: 0, flex: "1 1 auto", textAlign: "left" }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {service.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {statusLabel}
          </Typography>
        </Box>
      </ButtonBase>
    </Box>
  );
}

export const ProjectComposeServiceRowX = observer(ProjectComposeServiceRow);
