/**
 * Renders the local project task panel.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import {
  Box,
  CircularProgress,
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
import type { OpenCodexProjectTask } from "@open-codex-ui/opencodex-protocol";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectTaskStatusFilter } from "../../stores/ProjectTasksStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectTaskDialogX } from "./ProjectTaskDialog";
import { ProjectTaskRow } from "./ProjectTaskRow";

type ProjectTasksPanelProps = {
  projectStore: ProjectStore;
};

const statusFilters: ProjectTaskStatusFilter[] = [
  "all",
  "todo",
  "inProgress",
  "toValidate",
  "done"
];

/**
 * Renders local tasks for one project.
 *
 * @param props Component props.
 * @returns Rendered task panel.
 */
export function ProjectTasksPanel({ projectStore }: ProjectTasksPanelProps) {
  const { t } = useTranslation();
  const tasksStore = projectStore.tasksStore;
  const [selectedTask, setSelectedTask] = useState<OpenCodexProjectTask | null>(null);
  const [isDialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    void tasksStore.loadTasks();
  }, [projectStore.project.id, tasksStore]);

  function handleCreate(): void {
    setSelectedTask(null);
    setDialogOpen(true);
  }

  function handleOpenTask(task: OpenCodexProjectTask): void {
    setSelectedTask(task);
    setDialogOpen(true);
  }

  function handleCloseDialog(): void {
    setDialogOpen(false);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    tasksStore.setSearchTerm(event.target.value);
  }

  function handleStatusFilterChange(event: SelectChangeEvent): void {
    tasksStore.setStatusFilter(event.target.value as ProjectTaskStatusFilter);
  }

  return (
    <section className="project-tasks-panel">
      <Stack className="project-tasks-header" direction="row" spacing={1}>
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="caption" color="text.secondary">
            {t("tasks.description")}
          </Typography>
        </Box>
        <Tooltip title={t("tasks.add")}>
          <span>
            <IconButton
              className="project-task-add-button"
              type="button"
              aria-label={t("tasks.add")}
              disabled={tasksStore.isSaving}
              onClick={handleCreate}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Stack className="project-tasks-controls" spacing={1}>
        <TextField
          size="small"
          label={t("tasks.search")}
          value={tasksStore.searchTerm}
          fullWidth
          onChange={handleSearchChange}
        />
        <FormControl size="small" fullWidth>
          <InputLabel id="project-task-filter-label">{t("tasks.filter")}</InputLabel>
          <Select
            labelId="project-task-filter-label"
            label={t("tasks.filter")}
            value={tasksStore.statusFilter}
            onChange={handleStatusFilterChange}
          >
            {statusFilters.map((status) => (
              <MenuItem key={status} value={status}>
                {t(`tasks.status.${status}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack className="project-tasks-content" spacing={0.75}>
        {tasksStore.isLoading ? <CircularProgress size={18} /> : null}

        {tasksStore.filteredTasks.length === 0 && !tasksStore.isLoading ? (
          <Typography variant="body2" color="text.secondary">
            {t("tasks.empty")}
          </Typography>
        ) : null}

        {tasksStore.filteredTasks.map((task) => (
          <ProjectTaskRow key={task.id} task={task} onOpen={handleOpenTask} />
        ))}
      </Stack>

      <ProjectTaskDialogX
        open={isDialogOpen}
        task={selectedTask}
        tasksStore={tasksStore}
        onClose={handleCloseDialog}
      />
    </section>
  );
}

export const ProjectTasksPanelX = observer(ProjectTasksPanel);
