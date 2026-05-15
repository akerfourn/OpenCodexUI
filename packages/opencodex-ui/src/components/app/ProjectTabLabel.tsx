/**
 * Renders a project tab label with a close action.
 */
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { Box, CircularProgress, IconButton, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectStore } from "../../stores/ProjectStore";

type ProjectTabLabelProps = {
  projectStore: ProjectStore;
  onClose(projectId: string): void;
};

/**
 * Renders a project tab label.
 *
 * @param props Component props.
 *
 * @returns Rendered tab label.
 */
export function ProjectTabLabel({ projectStore, onClose }: ProjectTabLabelProps) {
  const { t } = useTranslation();
  const indicatorState = projectStore.indicatorState;
  const iconClassName = indicatorState === "unseen" ? "work-indicator-pulse" : undefined;

  function handleClose(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onClose(projectStore.project.id);
  }

  return (
    <Box className="project-tab-label">
      {indicatorState === "running" ? (
        <CircularProgress size={16} thickness={5} />
      ) : (
        <FolderOutlinedIcon className={iconClassName} fontSize="small" />
      )}
      <Typography component="span" variant="body2" noWrap>
        {projectStore.displayName}
      </Typography>
      <IconButton
        aria-label={t("tabs.closeProject", { project: projectStore.displayName })}
        title={t("tabs.closeProject", { project: projectStore.displayName })}
        size="small"
        onClick={handleClose}
      >
        <CloseOutlinedIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export const ProjectTabLabelX = observer(ProjectTabLabel);
