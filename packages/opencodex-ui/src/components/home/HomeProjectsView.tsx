/**
 * Renders project opening controls on the Home tab.
 */
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
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
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  type SelectProps
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexProject,
  OpenCodexProjectGroup,
  OpenCodexSourceColor
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { HomeProjectDeleteDialog } from "./HomeProjectDeleteDialog";
import { HomeProjectGroupAssignmentDialog } from "./HomeProjectGroupAssignmentDialog";
import { HomeProjectGroupDeleteDialog } from "./HomeProjectGroupDeleteDialog";
import { HomeProjectGroupDialog } from "./HomeProjectGroupDialog";
import { HomeProjectTreeList } from "./HomeProjectTreeList";
import { buildHomeProjectTree, nestHomeProjectTreeNodes } from "./homeProjectTree";

type HomeProjectsViewProps = {
  store: RootStore;
};

/** Renders Home project controls. */
export function HomeProjectsView({ store }: HomeProjectsViewProps) {
  const { t } = useTranslation();
  const [projectPendingDeletion, setProjectPendingDeletion] =
    useState<OpenCodexProject | null>(null);
  const [projectPendingAssignment, setProjectPendingAssignment] =
    useState<OpenCodexProject | null>(null);
  const [groupPendingDeletion, setGroupPendingDeletion] =
    useState<OpenCodexProjectGroup | null>(null);
  const [groupDialog, setGroupDialog] = useState<{
    mode: "create" | "rename";
    group: OpenCodexProjectGroup | null;
  } | null>(null);
  const projectsStore = store.projectsStore;
  const projectGroupsStore = store.projectGroupsStore;
  const sourcesStore = store.sourcesStore;

  useEffect(() => {
    void projectGroupsStore.refresh();
  }, [projectGroupsStore]);

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

  function handleConfirmProjectDeletion(projectId: string): void {
    projectsStore.deleteProject(projectId);
    setProjectPendingDeletion(null);
  }

  function handleCreateGroup(): void {
    setGroupDialog({ mode: "create", group: null });
  }

  function handleRenameGroup(group: OpenCodexProjectGroup): void {
    setGroupDialog({ mode: "rename", group });
  }

  function handleConfirmGroupDialog(name: string, color: OpenCodexSourceColor): void {
    if (groupDialog === null) {
      return;
    }

    if (groupDialog.mode === "create") {
      projectGroupsStore.createGroup(name, color);
    } else if (groupDialog.group !== null) {
      projectGroupsStore.updateGroup(groupDialog.group.id, { name, color });
    }
    setGroupDialog(null);
  }

  function handleConfirmGroupDeletion(groupId: string): void {
    projectGroupsStore.deleteGroup(groupId);
    setGroupPendingDeletion(null);
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
  const availableProjects = getAvailableProjects(
    projectsStore.projects,
    store.homeStore.showHiddenProjects,
    store.homeStore.selectedSourceId
  );
  const treeNodes = buildHomeProjectTree({
    projects: availableProjects,
    groups: projectGroupsStore.groups,
    items: projectGroupsStore.items,
    searchTerm: store.homeStore.projectSearchTerm
  });
  const treeBranches = nestHomeProjectTreeNodes(treeNodes);
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
            select: { displayEmpty: true, renderValue: renderSourceValue }
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
          <IconButton aria-label={t("home.pickExisting")} onClick={handlePickExisting} color="primary">
            <FolderOpenOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("home.pickNew")}>
          <IconButton aria-label={t("home.pickNew")} onClick={handlePickNew} color="primary">
            <CreateNewFolderOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("home.createProjectGroup")}>
          <IconButton aria-label={t("home.createProjectGroup")} onClick={handleCreateGroup} color="primary">
            <FolderCopyOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {store.homeStore.isOpeningProject ? <LinearProgress /> : null}

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
        {treeBranches.length > 0 ? (
          <HomeProjectTreeList
            branches={treeBranches}
            sourceById={sourceById}
            onOpenProject={handleOpenRecent}
            onSetProjectHidden={handleSetProjectHidden}
            onDeleteProject={handleDeleteProject}
            onOrganizeProject={setProjectPendingAssignment}
            onToggleGroup={(groupId) => projectGroupsStore.toggleGroup(groupId)}
            onRenameGroup={handleRenameGroup}
            onDeleteGroup={setGroupPendingDeletion}
          />
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
        onCancel={() => setProjectPendingDeletion(null)}
        onConfirm={handleConfirmProjectDeletion}
      />
      <HomeProjectGroupDialog
        open={groupDialog !== null}
        mode={groupDialog?.mode ?? "create"}
        initialName={groupDialog?.group?.name}
        initialColor={groupDialog?.group?.color}
        onCancel={() => setGroupDialog(null)}
        onConfirm={handleConfirmGroupDialog}
      />
      <HomeProjectGroupDeleteDialog
        group={groupPendingDeletion}
        onCancel={() => setGroupPendingDeletion(null)}
        onConfirm={handleConfirmGroupDeletion}
      />
      <HomeProjectGroupAssignmentDialog
        project={projectPendingAssignment}
        groups={projectGroupsStore.groups}
        currentGroupId={projectPendingAssignment === null
          ? null
          : projectGroupsStore.getProjectGroupId(projectPendingAssignment.id)}
        onCancel={() => setProjectPendingAssignment(null)}
        onConfirm={(groupId) => {
          if (projectPendingAssignment !== null) {
            projectGroupsStore.assignProject(projectPendingAssignment.id, groupId);
          }
          setProjectPendingAssignment(null);
        }}
      />
    </Stack>
  );
}

export const HomeProjectsViewX = observer(HomeProjectsView);

/** Filters projects by visibility/source before the recursive tree search runs. */
function getAvailableProjects(
  projects: OpenCodexProject[],
  showHiddenProjects: boolean,
  sourceId: string | null
): OpenCodexProject[] {
  const visibleProjects = showHiddenProjects
    ? projects
    : projects.filter((project) => !project.isHidden);
  const availableProjects = sourceId === null
    ? visibleProjects
    : visibleProjects.filter((project) => project.sourceId === sourceId);

  return [...availableProjects].sort(compareProjectsByEditedAt);
}

/** Keeps newly discovered projects deterministic before they enter the tree. */
function compareProjectsByEditedAt(left: OpenCodexProject, right: OpenCodexProject): number {
  return readTimestamp(right.editedAt) - readTimestamp(left.editedAt);
}

/** Reads a timestamp without allowing malformed cache data to break rendering. */
function readTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
