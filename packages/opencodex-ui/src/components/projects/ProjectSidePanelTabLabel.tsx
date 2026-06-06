/**
 * Renders an icon-only project side-panel tab label with a tooltip.
 */
import { Tooltip } from "@mui/material";
import type { ReactElement } from "react";

type ProjectSidePanelTabLabelProps = {
  label: string;
  icon: ReactElement;
};

/**
 * Renders one compact tab label.
 *
 * @param props Component props.
 *
 * @returns Rendered tab label.
 */
export function ProjectSidePanelTabLabel({ label, icon }: ProjectSidePanelTabLabelProps) {
  return (
    <Tooltip title={label}>
      <span className="project-side-panel-tab-label" aria-hidden="true">
        {icon}
      </span>
    </Tooltip>
  );
}
