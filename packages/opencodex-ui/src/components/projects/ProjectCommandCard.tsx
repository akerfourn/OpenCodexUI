/**
 * Renders a project command and its visible runs.
 */
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type {
  ProjectCommandRunView,
  ProjectCommandsStore
} from "../../stores/project/ProjectCommandsStore";
import { ProjectCommandRunRowX } from "./ProjectCommandRunRow";
import { ProjectCommandActionsX } from "./ProjectCommandActions";

type ProjectCommandCardProps = {
  command: OpenCodexProjectCommand;
  commandsStore: ProjectCommandsStore;
  runs: ProjectCommandRunView[];
  canMoveDown: boolean;
  canMoveUp: boolean;
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
  canMoveDown,
  canMoveUp,
  onEdit,
  onOpenLogs
}: ProjectCommandCardProps) {
  const { t } = useTranslation();
  const canRun = commandsStore.canRunCommand(command);

  function handleRun(): void {
    void commandsStore.runCommand(command);
  }

  return (
    <Box className="project-command-card">
      <Stack className="project-command-card-main" direction="row" spacing={0.75}>
        <Tooltip title={t(canRun ? "commands.run" : "commands.runUnavailable")} placement="left" disableInteractive>
          <span>
            <IconButton
              className="project-command-play"
              color="primary"
              disabled={!canRun}
              onClick={handleRun}
              aria-label={t("commands.run")}
            >
              <PlayArrowOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="body2" noWrap title={command.name} sx={{ lineHeight: 1.3 }}>
            {command.name}
          </Typography>
          <Typography component="div" variant="caption" color="text.secondary" noWrap title={command.command} sx={{ fontSize: 11 }}>
            {command.command}
          </Typography>
          <Typography component="div" variant="caption" color="text.secondary" noWrap
            title={t(`commands.executionModes.${command.executionMode}`)} sx={{ fontSize: 10, lineHeight: 1.4 }}>
            {t(`commands.executionModes.${command.executionMode}`)}
          </Typography>
        </Box>
        <ProjectCommandActionsX command={command} store={commandsStore} canMoveUp={canMoveUp} canMoveDown={canMoveDown} onEdit={onEdit} />
      </Stack>
      {runs.length > 0 ? (
        <Stack className="project-command-runs" spacing={0.5}>
          {runs.map((run) => (
            <ProjectCommandRunRowX
              key={run.id}
              run={run}
              workspaceLabel={commandsStore.getRunWorkspaceLabel(run, t("workspaces.primary"))}
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
