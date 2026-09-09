/**
 * Renders an icon-only project side-panel tab label with a tooltip.
 */
import { Tooltip } from "@mui/material";
import type { ReactElement } from "react";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import {
  ProjectSidePanelTabActivityX,
  type ProjectSidePanelActivity
} from "./ProjectSidePanelTabActivity";

type ProjectSidePanelTabLabelProps = {
  projectStore: ProjectStore;
  label: string;
  icon: ReactElement;
  activity: ProjectSidePanelActivity;
};

/**
 * Renders one compact tab label.
 *
 * @param props Component props.
 *
 * @returns Rendered tab label.
 */
export function ProjectSidePanelTabLabel({
  projectStore,
  label,
  icon,
  activity
}: ProjectSidePanelTabLabelProps) {
  return (
    <Tooltip title={label}>
      <span className="project-side-panel-tab-label" aria-hidden="true">
        <ProjectSidePanelTabActivityX
          projectStore={projectStore}
          activity={activity}
          icon={icon}
        />
      </span>
    </Tooltip>
  );
}
