/**
 * Renders the visual state marker shared by Compose service views.
 */
import { Box } from "@mui/material";

import type { OpenCodexDockerComposeServiceState } from "@open-codex-ui/opencodex-protocol";

type ProjectComposeStatusIndicatorProps = {
  state: OpenCodexDockerComposeServiceState;
};

/** Renders a decorative state dot whose meaning is repeated as visible text. */
export function ProjectComposeStatusIndicator({
  state
}: ProjectComposeStatusIndicatorProps) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      className={`project-compose-status-indicator is-${state}`}
    />
  );
}
