/**
 * Renders project opening controls on the Home tab.
 */
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  type SelectProps
} from "@mui/material";
import Fuse from "fuse.js";
import { observer } from "mobx-react-lite";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { HomeProjectDeleteDialog } from "./HomeProjectDeleteDialog";
import { HomeProjectListItem } from "./HomeProjectListItem";

type HomeProjectsViewProps = {
  store: RootStore;
};

/**
 * Renders Home project controls.
 *
 * @param props Component props.
 *
 * @returns Rendered project view.
 */
export function HomeProjectsView({ store }: HomeProjectsViewProps) {
  const { t } = useTranslation();
  const [projectPendingDeletion, setProjectPendingDeletion] =
    useState<OpenCodexProject | null>(null);
  const projectsStore = store.projectsStore;
  const sourcesStore = store.sourcesStore;

  function handlePickExisting(): void {
    projectsStore.openProjectFromPicker("open");
  }

  function handlePickNew(): void {
    projectsStore.openProjectFromPicker("create");
  }

  function handleOpenRecent(projectPath: string, sourceId: string | null): void {
    projectsStore.openProject(projectPath, false, sourceId);
  }

  function handleRefreshProjects(): void {
    projectsStore.refreshProjects();
  }

  function handleToggleHiddenProjects(): void {
    projectsStore.setShowHiddenProjects(!store.homeStore.showHiddenProjects);
  }

  function handleSetProjectHidden(projectId: string, isHidden: boolean): void {
    projectsStore.setProjectHidden(projectId, isHidden);
  }

  function handleDeleteProject(project: OpenCodexProject): void {
    setProjectPendingDeletion(project);
  }

  function handleCancelProjectDeletion(): void {
    setProjectPendingDeletion(null);
  }

  function handleConfirmProjectDeletion(projectId: string): void {
    projectsStore.deleteProject(projectId);
    setProjectPendingDeletion(null);
  }

  function handleSourceChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    sourcesStore.setHomeSelectedSource(event.target.value);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.homeStore.setProjectSearchTerm(event.target.value);
  }

  const renderSourceValue: NonNullable<SelectProps["renderValue"]> = (selected) => {
    if (typeof selected !== "string" || selected.length === 0) {
      return (
        <Typography component="span" sx={{ fontStyle: "italic" }}>
          {t("home.allSources")}
        </Typography>
      );
    }

    return sourcesStore.sources.find((source) => source.id === selected)?.name ?? selected;
  };
  const hiddenProjectCount = projectsStore.projects.filter((project) => project.isHidden).length;
  const visibleProjects = getVisibleProjects(
    projectsStore.projects,
    store.homeStore.showHiddenProjects,
    store.homeStore.selectedSourceId,
    store.homeStore.projectSearchTerm
  );
  const hasProjects = visibleProjects.length > 0;
  const sourceById = new Map(sourcesStore.sources.map((source) => [source.id, source]));
  const hiddenProjectsButtonLabel = store.homeStore.showHiddenProjects
    ? t("home.hideHiddenProjects")
    : t("home.showHiddenProjects");

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Box sx={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h5" component="h2" sx={{ flex: "1 1 auto" }}>
          {t("home.projects")}
        </Typography>
        <TextField
          select
          size="small"
          value={store.homeStore.selectedSourceId ?? ""}
          label={t("sources.source")}
          onChange={handleSourceChange}
          slotProps={{
            inputLabel: { shrink: true },
            select: {
              displayEmpty: true,
              renderValue: renderSourceValue
            }
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">
            <Typography component="span" sx={{ fontStyle: "italic" }}>
              {t("home.allSources")}
            </Typography>
          </MenuItem>
          {sourcesStore.sources.map((source) => (
            <MenuItem value={source.id} key={source.id}>
              {source.name}
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title={t("home.pickExisting")}>
          <IconButton
            aria-label={t("home.pickExisting")}
            onClick={handlePickExisting}
            color="primary"
          >
            <FolderOpenOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("home.pickNew")}>
          <IconButton
            aria-label={t("home.pickNew")}
            onClick={handlePickNew}
            color="primary"
          >
            <CreateNewFolderOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {store.homeStore.isOpeningProject ? (
        <LinearProgress />
      ) : null}

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <TextField
            fullWidth
            size="small"
            value={store.homeStore.projectSearchTerm}
            placeholder={t("home.searchProjects")}
            onChange={handleSearchChange}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" />
                  </InputAdornment>
                )
              }
            }}
          />
          <IconButton
            aria-label={hiddenProjectsButtonLabel}
            title={hiddenProjectsButtonLabel}
            size="small"
            onClick={handleToggleHiddenProjects}
            disabled={hiddenProjectCount === 0}
          >
            {store.homeStore.showHiddenProjects ? (
              <VisibilityOffOutlinedIcon fontSize="small" />
            ) : (
              <VisibilityOutlinedIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton
            aria-label={t("home.refreshProjects")}
            title={t("home.refreshProjects")}
            size="small"
            onClick={handleRefreshProjects}
          >
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
        {hasProjects ? (
          <List dense sx={{ mt: 1 }}>
            {visibleProjects.map((project) => {
              const source = project.sourceId === null ? null : sourceById.get(project.sourceId) ?? null;

              return (
                <HomeProjectListItem
                  key={project.id}
                  project={project}
                  sourceName={source === null ? null : source.name}
                  sourceColor={source === null ? null : source.settings.color}
                  onOpen={handleOpenRecent}
                  onSetHidden={handleSetProjectHidden}
                  onDelete={handleDeleteProject}
                />
              );
            })}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {store.homeStore.projectSearchTerm.trim().length > 0
              ? t("home.noProjectSearchResults")
              : t("home.noRecentProjects")}
          </Typography>
        )}
      </Box>
      <HomeProjectDeleteDialog
        project={projectPendingDeletion}
        onCancel={handleCancelProjectDeletion}
        onConfirm={handleConfirmProjectDeletion}
      />
    </Stack>
  );
}

export const HomeProjectsViewX = observer(HomeProjectsView);

function getVisibleProjects(
  projects: OpenCodexProject[],
  showHiddenProjects: boolean,
  sourceId: string | null,
  searchTerm: string
): OpenCodexProject[] {
  const visibleProjects = showHiddenProjects
    ? projects
    : projects.filter((project) => !project.isHidden);
  const availableProjects = sourceId === null
    ? visibleProjects
    : visibleProjects.filter((project) => project.sourceId === sourceId);
  const normalizedSearchTerm = searchTerm.trim();

  if (normalizedSearchTerm.length === 0) {
    return [...availableProjects].sort(compareProjectsByEditedAt);
  }

  const fuse = new Fuse(availableProjects, {
    includeScore: true,
    keys: [
      { name: "displayName", weight: 0.45 },
      { name: "defaultName", weight: 0.45 },
      { name: "path", weight: 0.2 }
    ],
    threshold: 0.38
  });

  return fuse.search(normalizedSearchTerm).map((result) => result.item);
}

function compareProjectsByEditedAt(left: OpenCodexProject, right: OpenCodexProject): number {
  return readTimestamp(right.editedAt) - readTimestamp(left.editedAt);
}

function readTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
