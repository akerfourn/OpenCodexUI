/** Renders the optional activity marker shared by side-panel tab variants. */
import { Badge } from "@mui/material";
import type { ReactElement } from "react";

type ProjectSidePanelTabIndicatorProps = {
  icon: ReactElement;
  hasActivity: boolean;
};

/**
 * Adds a small error-colored dot when a project tool needs attention.
 *
 * @param props Icon and activity state to render.
 * @returns Icon with an optional activity marker.
 */
export function ProjectSidePanelTabIndicator({
  icon,
  hasActivity
}: ProjectSidePanelTabIndicatorProps) {
  if (!hasActivity) {
    return (
      <span className="project-side-panel-tab-indicator">
        {icon}
      </span>
    );
  }

  return (
    <Badge
      className="project-side-panel-tab-indicator is-active"
      color="error"
      overlap="circular"
      variant="dot"
    >
      {icon}
    </Badge>
  );
}
