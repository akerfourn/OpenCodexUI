/**
 * Renders an icon-only project side-panel tab label with a tooltip.
 */
import { Tooltip } from "@mui/material";
import type { ReactElement } from "react";

import { ProjectSidePanelTabIndicator } from "./ProjectSidePanelTabIndicator";

type ProjectSidePanelTabLabelProps = {
  label: string;
  icon: ReactElement;
  hasActivity: boolean;
};

/**
 * Renders one compact tab label.
 *
 * @param props Component props.
 *
 * @returns Rendered tab label.
 */
export function ProjectSidePanelTabLabel({
  label,
  icon,
  hasActivity
}: ProjectSidePanelTabLabelProps) {
  return (
    <Tooltip title={label}>
      <span className="project-side-panel-tab-label" aria-hidden="true">
        <ProjectSidePanelTabIndicator icon={icon} hasActivity={hasActivity} />
      </span>
    </Tooltip>
  );
}
