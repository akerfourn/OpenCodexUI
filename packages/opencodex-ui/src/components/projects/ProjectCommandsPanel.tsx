/**
 * Renders the project commands tool panel.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import { Alert, Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandRunView } from "../../stores/ProjectCommandsStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectCommandCardX } from "./ProjectCommandCard";
import { ProjectCommandDialogX } from "./ProjectCommandDialog";
import { ProjectCommandLogsDialogX } from "./ProjectCommandLogsDialog";

type ProjectCommandsPanelProps = {
  projectStore: ProjectStore;
};

/**
 * Renders configured project commands and live command instances.
 *
 * @param props Component props.
 * @returns Rendered commands panel.
 */
export function ProjectCommandsPanel({ projectStore }: ProjectCommandsPanelProps) {
  const { t } = useTranslation();
  const commandsStore = projectStore.commandsStore;
  const [editedCommand, setEditedCommand] = useState<OpenCodexProjectCommand | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);
  const [logsRun, setLogsRun] = useState<ProjectCommandRunView | null>(null);

  useEffect(() => {
    void commandsStore.loadCommands();
  }, [commandsStore, projectStore.project.id]);

  function handleCreate(): void {
    setEditedCommand(null);
    setDialogOpen(true);
  }

  function handleEdit(command: OpenCodexProjectCommand): void {
    setEditedCommand(command);
    setDialogOpen(true);
  }

  function handleCloseDialog(): void {
    setDialogOpen(false);
  }

  function handleOpenLogs(run: ProjectCommandRunView): void {
    setLogsRun(run);
  }

  function handleCloseLogs(): void {
    setLogsRun(null);
  }

  return (
    <section className="project-commands-panel">
      <Stack className="project-commands-header" direction="row" spacing={1}>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="caption" color="text.secondary">
            {t("commands.description")}
          </Typography>
        </Box>
        <Tooltip title={t("commands.add")}>
          <span>
            <IconButton
              className="project-command-add-button"
              type="button"
              aria-label={t("commands.add")}
              disabled={!commandsStore.isAvailable}
              onClick={handleCreate}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {commandsStore.isLoading ? <CircularProgress size={18} /> : null}

      <Stack className="project-commands-content" spacing={1}>
        {!commandsStore.isAvailable ? (
          <Alert severity="warning">{t("commands.sourceUnavailable")}</Alert>
        ) : null}

        {commandsStore.commands.length === 0 && !commandsStore.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            {t("commands.empty")}
          </Typography>
        ) : null}

        {commandsStore.commands.map((command, index) => (
          <ProjectCommandCardX
            key={command.id}
            command={command}
            commandsStore={commandsStore}
            runs={commandsStore.getRuns(command.id)}
            canMoveUp={index > 0}
            canMoveDown={index < commandsStore.commands.length - 1}
            onEdit={handleEdit}
            onOpenLogs={handleOpenLogs}
          />
        ))}
      </Stack>

      <ProjectCommandDialogX
        command={editedCommand}
        commandsStore={commandsStore}
        open={isDialogOpen}
        onClose={handleCloseDialog}
      />
      <ProjectCommandLogsDialogX
        run={logsRun}
        open={logsRun !== null}
        onClose={handleCloseLogs}
      />
    </section>
  );
}

export const ProjectCommandsPanelX = observer(ProjectCommandsPanel);
