/**
 * Renders the create/edit dialog for a project command.
 */
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Tooltip
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type {
  ProjectCommandFormInput,
  ProjectCommandsStore
} from "../../stores/ProjectCommandsStore";
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
  allowParallel: false,
  persistLogs: false
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
      allowParallel: command.allowParallel,
      persistLogs: command.persistLogs
    });
  }, [command, open]);

  function handleNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, name: event.target.value });
  }

  function handleCommandChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, command: event.target.value });
  }

  function handleAllowParallelChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput({ ...input, allowParallel: event.target.checked });
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
              fullWidth
              multiline
              minRows={2}
              onChange={handleCommandChange}
            />
            <FormControlLabel
              control={(
                <Checkbox
                  checked={input.allowParallel}
                  onChange={handleAllowParallelChange}
                />
              )}
              label={t("commands.allowParallel")}
            />
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
