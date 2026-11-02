/**
 * Renders the project commands tool panel.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Alert, Box, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandRunView } from "../../stores/project/ProjectCommandsStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectCommandSectionsX } from "./ProjectCommandSections";
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
  const [initialGroupName, setInitialGroupName] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const groupBusy = commandsStore.isSaving || commandsStore.groups.isSaving;
  const groupExists = commandsStore.groups.names.includes(groupName.trim());
  const invalidGroup = groupName.trim().length === 0 || groupName.trim().length > 100
    || groupExists;
  const groupHelp = groupExists ? t("commands.groupExists") : undefined;

  useEffect(() => {
    void commandsStore.loadCommands();
    void commandsStore.groups.load();
  }, [commandsStore, projectStore.project.id]);

  function handleCreate(): void {
    setInitialGroupName(null);
    setEditedCommand(null);
    setDialogOpen(true);
  }

  /** Opens command creation with this group's membership already selected. */
  function handleCreateInGroup(name: string): void {
    setInitialGroupName(name);
    setEditedCommand(null);
    setDialogOpen(true);
  }

  /** Creates an empty group inline rather than requiring a command settings edit. */
  function handleNewGroup(): void {
    setGroupName("");
    setCreatingGroup(true);
  }

  /** Keeps group entry open after a failed save so the user can correct it. */
  async function handleSaveGroup(): Promise<void> {
    if (invalidGroup || groupBusy) return;
    if (await commandsStore.groups.create(groupName)) setCreatingGroup(false);
  }

  /** Supports Enter to save and Escape to cancel the inline group form. */
  function handleGroupKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSaveGroup();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      setCreatingGroup(false);
    }
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

  const groupForm = creatingGroup ? <Stack direction="row" spacing={0.5} sx={{ px: 1, pb: 1, alignItems: "center" }}>
    <TextField autoFocus size="small" label={t("commands.groupName")} value={groupName}
      error={groupExists} helperText={groupHelp}
      onChange={event => setGroupName(event.target.value)} onKeyDown={handleGroupKeyDown} disabled={groupBusy}
      slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ flex: 1, minWidth: 0 }} />
    <IconButton size="small" aria-label={t("commands.save")} disabled={invalidGroup || groupBusy}
      onClick={() => void handleSaveGroup()}><CheckOutlinedIcon fontSize="small" /></IconButton>
    <IconButton size="small" aria-label={t("commands.cancel")} disabled={groupBusy}
      onClick={() => setCreatingGroup(false)}><CloseOutlinedIcon fontSize="small" /></IconButton>
  </Stack> : null;
  const groupError = commandsStore.groups.error === null ? null : <Alert severity="error">{commandsStore.groups.error}</Alert>;

  return (
    <section className="project-commands-panel">
      <Stack className="project-commands-header" direction="row" spacing={1}>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="body2" title={t("commands.description")} sx={{ fontWeight: 600 }}>
            {t("commands.title")}
          </Typography>
        </Box>
        <Tooltip title={t("commands.createGroup")} placement="left" disableInteractive>
          <span><IconButton size="small" onClick={handleNewGroup} aria-label={t("commands.createGroup")} disabled={groupBusy}>
            <CreateNewFolderOutlinedIcon fontSize="small" />
          </IconButton></span>
        </Tooltip>
        <Tooltip title={t("commands.add")} placement="left" disableInteractive>
          <span>
            <IconButton
              className="project-command-add-button"
              type="button"
              aria-label={t("commands.add")}
              disabled={!commandsStore.isAvailable || groupBusy}
              onClick={handleCreate}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {groupForm}

      {commandsStore.isLoading ? <CircularProgress size={18} /> : null}

      <Stack className="project-commands-content" spacing={0.5}>
        {groupError}
        {!commandsStore.isAvailable ? (
          <Alert severity="warning">{t("commands.sourceUnavailable")}</Alert>
        ) : null}

        {commandsStore.commands.length === 0 && !commandsStore.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            {t("commands.empty")}
          </Typography>
        ) : null}

        <ProjectCommandSectionsX commandsStore={commandsStore} onCreate={handleCreateInGroup} onEdit={handleEdit} onOpenLogs={handleOpenLogs} />
      </Stack>

      <ProjectCommandDialogX
        command={editedCommand}
        commandsStore={commandsStore}
        open={isDialogOpen}
        onClose={handleCloseDialog}
        initialGroupName={initialGroupName}
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
