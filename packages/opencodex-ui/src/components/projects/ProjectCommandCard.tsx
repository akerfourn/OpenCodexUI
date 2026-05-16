/**
 * Renders a project command and its visible runs.
 */
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type {
  ProjectCommandRunView,
  ProjectCommandsStore
} from "../../stores/ProjectCommandsStore";
import { ProjectCommandRunRowX } from "./ProjectCommandRunRow";

type ProjectCommandCardProps = {
  command: OpenCodexProjectCommand;
  commandsStore: ProjectCommandsStore;
  runs: ProjectCommandRunView[];
  onEdit(command: OpenCodexProjectCommand): void;
  onOpenLogs(run: ProjectCommandRunView): void;
};

/**
 * Renders one command card.
 *
 * @param props Component props.
 * @returns Rendered command card.
 */
export function ProjectCommandCard({
  command,
  commandsStore,
  runs,
  onEdit,
  onOpenLogs
}: ProjectCommandCardProps) {
  const { t } = useTranslation();
  const canRun = commandsStore.canRunCommand(command);

  function handleRun(): void {
    void commandsStore.runCommand(command);
  }

  function handleEdit(): void {
    onEdit(command);
  }

  return (
    <Box className="project-command-card">
      <Stack className="project-command-card-main" direction="row" spacing={1.5}>
        <Tooltip title={t("commands.run")}>
          <span>
            <IconButton
              className="project-command-play"
              color="primary"
              disabled={!canRun}
              onClick={handleRun}
            >
              <PlayArrowOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="body1" noWrap>
            {command.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {command.command}
          </Typography>
        </Box>
        <Tooltip title={t("commands.edit")}>
          <IconButton className="project-command-edit" size="small" onClick={handleEdit}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {runs.length > 0 ? (
        <Stack className="project-command-runs" spacing={0.5}>
          {runs.map((run) => (
            <ProjectCommandRunRowX
              key={run.id}
              run={run}
              onCloseRun={commandsStore.closeRun}
              onOpenLogs={onOpenLogs}
              onStopRun={commandsStore.stopRun}
            />
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}

export const ProjectCommandCardX = observer(ProjectCommandCard);
