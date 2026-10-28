import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
/**
 * Renders a project command and its visible runs.
 */
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
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

  function handleEdit(): void {
    onEdit(command);
  }

  function handleMoveUp(): void {
    void commandsStore.moveCommand(command.id, "up");
  }

  function handleMoveDown(): void {
    void commandsStore.moveCommand(command.id, "down");
  }

  /** Favorites are promoted without changing the command's saved group. */
  function handleFavorite(): void { void commandsStore.toggleFavorite(command); }
  const favoriteLabel = t(command.isFavorite === true ? "commands.removeFavorite" : "commands.addFavorite");
  const favoriteIcon = command.isFavorite === true ? <StarOutlinedIcon fontSize="small" /> : <StarBorderOutlinedIcon fontSize="small" />;

  return (
    <Box className="project-command-card">
      <Stack className="project-command-card-main" direction="row" spacing={1.5}>
        <Tooltip title={t(canRun ? "commands.run" : "commands.runUnavailable")}>
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
          <Typography variant="body1" noWrap title={command.name}>
            {command.name}
          </Typography>
          <Typography component="div" variant="caption" color="text.secondary" noWrap title={command.command}>
            {command.command}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflowWrap: "anywhere" }}>
            {t(`commands.executionModes.${command.executionMode}`)}
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" spacing={0.25} sx={{ justifyContent: "flex-end", alignItems: "center", px: 0.5, pb: 0.5 }}>
        <Tooltip title={favoriteLabel} placement="left" disableInteractive>
          <span><IconButton size="small" onClick={handleFavorite} aria-label={favoriteLabel}
            aria-pressed={command.isFavorite === true} disabled={commandsStore.isSaving}
            color={command.isFavorite === true ? "warning" : "default"}>{favoriteIcon}</IconButton></span>
        </Tooltip>
        <Tooltip title={t("commands.edit")}>
          <IconButton className="project-command-edit" size="small" onClick={handleEdit}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Stack className="project-command-order-actions" direction="row" spacing={0.25}>
          <Tooltip title={t("commands.moveUp")}>
            <span>
              <IconButton
                size="small"
                disabled={!canMoveUp || commandsStore.isSaving}
                aria-label={t("commands.moveUp")}
                onClick={handleMoveUp}
              >
                <KeyboardArrowUpOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t("commands.moveDown")}>
            <span>
              <IconButton
                size="small"
                disabled={!canMoveDown || commandsStore.isSaving}
                aria-label={t("commands.moveDown")}
                onClick={handleMoveDown}
              >
                <KeyboardArrowDownOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
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
