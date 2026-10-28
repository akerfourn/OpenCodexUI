/**
 * Renders the create/edit dialog for a project command.
 */
import {
  Autocomplete,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Tooltip
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexCommandExecutionMode, OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type {
  ProjectCommandFormInput,
  ProjectCommandsStore
} from "../../stores/project/ProjectCommandsStore";
import { ProjectCommandDeleteDialog } from "./ProjectCommandDeleteDialog";

type ProjectCommandDialogProps = {
  command: OpenCodexProjectCommand | null;
  commandsStore: ProjectCommandsStore;
  open: boolean;
  onClose(): void;
};

const emptyInput: ProjectCommandFormInput = {
  name: "",
  command: "",
  executionMode: "project",
  persistLogs: false,
  groupName: null,
  isFavorite: false
};

/**
 * Renders a modal form to create or edit one project command.
 *
 * @param props Component props.
 * @returns Rendered command dialog.
 */
export function ProjectCommandDialog({
  command,
  commandsStore,
  open,
  onClose
}: ProjectCommandDialogProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState<ProjectCommandFormInput>(emptyInput);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const isEditing = command !== null;
  const hasRunningRuns = command !== null && commandsStore.hasRunningRuns(command.id);
  const canSave = input.name.trim().length > 0 && input.command.trim().length > 0;

  useEffect(() => {
    if (!open) {
      return;
    }

    setInput(command === null ? emptyInput : {
      name: command.name,
      command: command.command,
      executionMode: command.executionMode,
      persistLogs: command.persistLogs,
      groupName: command.groupName ?? null,
      isFavorite: command.isFavorite === true
    });
  }, [command, open]);

  function handleNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, name: event.target.value });
  }

  function handleCommandChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, command: event.target.value });
  }

  /** Selects the scope of this command's concurrent executions. */
  function handleExecutionModeChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, executionMode: event.target.value as OpenCodexCommandExecutionMode });
  }

  function handlePersistLogsChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, persistLogs: event.target.checked });
  }

  async function handleSave(): Promise<void> {
    if (!canSave) {
      return;
    }

    if (command === null) {
      await commandsStore.createCommand(input);
    } else {
      await commandsStore.updateCommand(command.id, input);
    }

    onClose();
  }

  function handleOpenDeleteDialog(): void {
    setDeleteDialogOpen(true);
  }

  function handleCloseDeleteDialog(): void {
    setDeleteDialogOpen(false);
  }

  function handleConfirmDelete(): void {
    if (command === null) {
      return;
    }

    void commandsStore.deleteCommand(command.id).then(() => {
      setDeleteDialogOpen(false);
      onClose();
    }).catch(() => undefined);
  }

  return (
    <>
      <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
        <DialogTitle>
          {isEditing ? t("commands.editTitle") : t("commands.createTitle")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t("commands.name")}
              value={input.name}
              fullWidth
              onChange={handleNameChange}
            />
            <TextField
              label={t("commands.command")}
              value={input.command}
              helperText={t("commands.shellHelp")}
              fullWidth
              multiline
              minRows={2}
              onChange={handleCommandChange}
            />
            <Autocomplete freeSolo options={[...new Set(commandsStore.commands.map(item => item.groupName)
              .filter((name): name is string => name != null))]}
              inputValue={input.groupName ?? ""}
              onInputChange={(_event, value) => setInput({ ...input, groupName: value || null })}
              renderInput={params => <TextField {...params} label={t("commands.group")}
                helperText={t("commands.groupHelp")} slotProps={{ ...params.slotProps,
                  htmlInput: { ...params.slotProps.htmlInput, maxLength: 100 } }} />} />
            <FormControlLabel label={t("commands.favorite")}
              control={<Checkbox checked={input.isFavorite === true}
                onChange={event => setInput({ ...input, isFavorite: event.target.checked })} />} />
            <TextField select fullWidth label={t("commands.executionMode")}
              value={input.executionMode} onChange={handleExecutionModeChange}
              helperText={t(`commands.executionModeHelp.${input.executionMode}`)}>
              <MenuItem value="project">{t("commands.executionModes.project")}</MenuItem>
              <MenuItem value="workspace">{t("commands.executionModes.workspace")}</MenuItem>
              <MenuItem value="parallel">{t("commands.executionModes.parallel")}</MenuItem>
            </TextField>
            <FormControlLabel
              control={(
                <Checkbox
                  checked={input.persistLogs}
                  onChange={handlePersistLogsChange}
                />
              )}
              label={t("commands.persistLogs")}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {isEditing ? (
            <Tooltip title={hasRunningRuns ? t("commands.deleteRunningDisabled") : ""}>
              <span>
                <Button
                  color="error"
                  disabled={commandsStore.isSaving || hasRunningRuns}
                  onClick={handleOpenDeleteDialog}
                >
                  {t("commands.delete")}
                </Button>
              </span>
            </Tooltip>
          ) : null}
          <Button disabled={commandsStore.isSaving} onClick={onClose}>
            {t("commands.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={!canSave || commandsStore.isSaving}
            onClick={() => {
              void handleSave();
            }}
          >
            {t("commands.save")}
          </Button>
        </DialogActions>
      </Dialog>
      {command !== null ? (
        <ProjectCommandDeleteDialog
          commandName={command.name}
          disabled={hasRunningRuns || commandsStore.isSaving}
          open={isDeleteDialogOpen}
          onClose={handleCloseDeleteDialog}
          onConfirm={handleConfirmDelete}
        />
      ) : null}
    </>
  );
}

export const ProjectCommandDialogX = observer(ProjectCommandDialog);
