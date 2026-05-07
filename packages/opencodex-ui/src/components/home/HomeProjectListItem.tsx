/**
 * Renders one project entry in the Home project list.
 */
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { Box, ListItemButton, ListItemIcon, Typography } from "@mui/material";

import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

type HomeProjectListItemProps = {
  project: OpenCodexProject;
  onOpen(projectPath: string): void;
};

/**
 * Renders one project list item.
 *
 * @param props Component props.
 *
 * @returns Rendered project item.
 */
export function HomeProjectListItem({ project, onOpen }: HomeProjectListItemProps) {
  const projectName = project.displayName ?? project.defaultName;

  function handleOpen(): void {
    onOpen(project.path);
  }

  return (
    <ListItemButton onClick={handleOpen} sx={{ borderRadius: 1, mb: 0.5 }}>
      <ListItemIcon sx={{ minWidth: 34 }}>
        <FolderOutlinedIcon fontSize="small" />
      </ListItemIcon>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap>
          {projectName}
        </Typography>
        <Typography variant="caption" component="div" color="text.secondary" noWrap>
          {project.path}
        </Typography>
      </Box>
    </ListItemButton>
  );
}
