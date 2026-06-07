/**
 * Renders one local project task row.
 */
import { Box, Chip, ListItemButton, Stack, Tooltip, Typography } from "@mui/material";
import type { OpenCodexProjectTask } from "@open-codex-ui/opencodex-protocol";
import { useTranslation } from "react-i18next";

type ProjectTaskRowProps = {
  task: OpenCodexProjectTask;
  onOpen(task: OpenCodexProjectTask): void;
};

/**
 * Renders a compact clickable task row.
 *
 * @param props Component props.
 *
 * @returns Rendered task row.
 */
export function ProjectTaskRow({ task, onOpen }: ProjectTaskRowProps) {
  const { t } = useTranslation();

  function handleOpen(): void {
    onOpen(task);
  }

  return (
    <Tooltip title={task.title} placement="left">
      <span className="project-task-row-tooltip">
        <ListItemButton
          className="project-task-row"
          onClick={handleOpen}
          sx={{ borderRadius: 1, px: 1, py: 0.75 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0, width: "100%" }}>
            <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
              <Typography variant="body2" noWrap>
                {task.title}
              </Typography>
            </Box>
            <Chip
              size="small"
              color={readStatusColor(task.status)}
              label={t(`tasks.status.${task.status}`)}
              sx={{ flex: "0 0 auto" }}
            />
          </Stack>
        </ListItemButton>
      </span>
    </Tooltip>
  );
}

function readStatusColor(
  status: OpenCodexProjectTask["status"]
): "default" | "primary" | "secondary" | "success" | "warning" {
  switch (status) {
    case "inProgress":
      return "primary";
    case "toValidate":
      return "warning";
    case "done":
      return "success";
    default:
      return "default";
  }
}
