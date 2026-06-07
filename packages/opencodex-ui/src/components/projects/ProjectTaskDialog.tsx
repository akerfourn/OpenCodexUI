/**
 * Renders the local project task detail and edit dialog.
 */
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type {
  OpenCodexProjectTask,
  OpenCodexProjectTaskStatus
} from "@open-codex-ui/opencodex-protocol";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectTasksStore } from "../../stores/ProjectTasksStore";
import { MarkdownMessageM } from "../messages/MarkdownMessage";
import { ProjectTaskDeleteDialog } from "./ProjectTaskDeleteDialog";

type ProjectTaskDialogProps = {
  open: boolean;
  task: OpenCodexProjectTask | null;
  tasksStore: ProjectTasksStore;
  onClose(): void;
};

const statusOptions: OpenCodexProjectTaskStatus[] = ["todo", "inProgress", "toValidate", "done"];

function handleOpenTaskLink(): void {
  // Task descriptions are local notes. Link opening can be wired later when
  // project-aware file/link handling is needed here.
}

/**
 * Renders a large modal for viewing and editing a task.
 *
 * @param props Component props.
 *
 * @returns Rendered task dialog.
 */
export function ProjectTaskDialog({ open, task, tasksStore, onClose }: ProjectTaskDialogProps) {
  const { t } = useTranslation();
  const isNewTask = task === null;
  const [isEditing, setEditing] = useState(isNewTask);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<OpenCodexProjectTaskStatus>("todo");
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const canSave = title.trim().length > 0 && !tasksStore.isSaving;
  const descriptionContent = description.trim().length > 0
    ? <MarkdownMessageM markdown={description} onOpenLink={handleOpenTaskLink} />
    : (
        <Typography variant="body2" color="text.secondary">
          {t("tasks.noDescription")}
        </Typography>
      );

  useEffect(() => {
    if (!open) {
      return;
    }

    setEditing(isNewTask);
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setDeleteDialogOpen(false);
  }, [isNewTask, open, task]);

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>): void {
    setTitle(event.target.value);
  }

  function handleDescriptionChange(event: ChangeEvent<HTMLInputElement>): void {
    setDescription(event.target.value);
  }

  function handleStatusChange(event: SelectChangeEvent): void {
    setStatus(event.target.value as OpenCodexProjectTaskStatus);
  }

  function handleEdit(): void {
    setEditing(true);
  }

  function handleCancelEdit(): void {
    if (isNewTask) {
      onClose();
      return;
    }

    setTitle(task.title);
    setDescription(task.description);
    setStatus(task.status);
    setEditing(false);
  }

  async function handleSave(): Promise<void> {
    if (!canSave) {
      return;
    }

    const input = {
      title,
      description,
      status
    };

    if (task === null) {
      await tasksStore.createTask(input);
    } else {
      await tasksStore.updateTask(task.id, input);
    }

    setEditing(false);
    onClose();
  }

  function handleOpenDeleteDialog(): void {
    setDeleteDialogOpen(true);
  }

  function handleCloseDeleteDialog(): void {
    setDeleteDialogOpen(false);
  }

  async function handleDelete(): Promise<void> {
    if (task === null) {
      return;
    }

    await tasksStore.deleteTask(task.id);
    setDeleteDialogOpen(false);
    onClose();
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
              {isNewTask ? t("tasks.createTitle") : t("tasks.detailsTitle")}
            </Box>
            {!isEditing && task !== null ? (
              <Tooltip title={t("tasks.edit")}>
                <IconButton aria-label={t("tasks.edit")} size="small" onClick={handleEdit}>
                  <EditOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
            {task !== null ? (
              <Tooltip title={t("tasks.delete")}>
                <IconButton
                  aria-label={t("tasks.delete")}
                  color="error"
                  size="small"
                  onClick={handleOpenDeleteDialog}
                >
                  <DeleteOutlineOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {isEditing ? (
            <Stack spacing={2}>
              <TextField
                label={t("tasks.titleLabel")}
                value={title}
                fullWidth
                autoFocus
                onChange={handleTitleChange}
              />
              <FormControl fullWidth>
                <InputLabel id="project-task-status-label">{t("tasks.statusLabel")}</InputLabel>
                <Select
                  labelId="project-task-status-label"
                  label={t("tasks.statusLabel")}
                  value={status}
                  onChange={handleStatusChange}
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {t(`tasks.status.${option}`)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label={t("tasks.descriptionLabel")}
                value={description}
                minRows={10}
                multiline
                fullWidth
                onChange={handleDescriptionChange}
              />
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography variant="h6">{task?.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t(`tasks.status.${task?.status ?? "todo"}`)}
                </Typography>
              </Stack>
              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 2
                }}
              >
                {descriptionContent}
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {isEditing ? (
            <>
              <Button onClick={handleCancelEdit}>{t("tasks.cancel")}</Button>
              <Button variant="contained" disabled={!canSave} onClick={() => void handleSave()}>
                {t("tasks.save")}
              </Button>
            </>
          ) : (
            <Button onClick={onClose}>{t("tasks.close")}</Button>
          )}
        </DialogActions>
      </Dialog>
      <ProjectTaskDeleteDialog
        open={isDeleteDialogOpen}
        isSaving={tasksStore.isSaving}
        onCancel={handleCloseDeleteDialog}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

export const ProjectTaskDialogX = observer(ProjectTaskDialog);
