/**
 * Renders one compact Docker Compose service row.
 */
import { Box, ButtonBase, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexDockerComposeSnapshot } from "@open-codex-ui/opencodex-protocol";

import { ProjectComposeStatusIndicator } from "./ProjectComposeStatusIndicator";

type ComposeService = OpenCodexDockerComposeSnapshot["services"][number];

type ProjectComposeServiceRowProps = {
  service: ComposeService;
  isSelected: boolean;
  onSelect(serviceName: string): void;
};

/** Renders one service with a text-and-color status that opens its dialog. */
export function ProjectComposeServiceRow({
  service,
  isSelected,
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
        aria-haspopup="dialog"
        aria-label={`${service.name}: ${statusLabel}`}
        onClick={handleSelect}
      >
        <ProjectComposeStatusIndicator state={service.state} />
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
