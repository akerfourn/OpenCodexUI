/**
 * Renders the chat list for one opened project.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ThreadButtonX } from "../threads/ThreadButton";
import type { OpenSubAgentDialog } from "../threads/subAgentDialog";
import { UsageLimitsWidgetX } from "../usage/UsageLimitsWidget";
import { ProjectStatisticsDialogX } from "./ProjectStatisticsDialog";

type ProjectThreadListProps = {
  store: RootStore;
  projectStore: ProjectStore;
  onOpenSubAgentDialog: OpenSubAgentDialog;
};

/**
 * Renders a project chat list.
 *
 * @param props Component props.
 *
 * @returns Rendered thread list.
 */
export function ProjectThreadList({
  store,
  projectStore,
  onOpenSubAgentDialog
}: ProjectThreadListProps) {
  const { t } = useTranslation();
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState(projectStore.displayName);
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [projectActionsAnchor, setProjectActionsAnchor] = useState<HTMLElement | null>(null);
  const [isStatisticsDialogOpen, setIsStatisticsDialogOpen] = useState(false);
  const threadListStore = projectStore.threadListStore;
  const source = store.sourcesStore.sources.find((entry) => entry.id === projectStore.project.sourceId);
  const isReadOnlyProject = projectStore.isReadOnlyFromCache;
  const canOpenProject = source !== undefined &&
    store.sourcesStore.hasLocalAccess(source.id) &&
    "openFolderCommand" in source.settings &&
    source.settings.openFolderCommand !== null;
  const canUseLocalProjectActions = source?.kind === "local";
  const sourceWarning = projectStore.isOrphan
    ? t("project.orphanSource")
    : t("project.codexSourceUnavailable");

  function handleSearch(event: ChangeEvent<HTMLInputElement>): void {
    threadListStore.setSearchTerm(event.target.value);
  }

  function handleNewThread(): void {
    projectStore.createThread();
  }

  function handleRefreshThreads(): void {
    projectStore.refreshThreads();
  }

  function handleOpenProject(): void {
    store.openProjectInIde(projectStore.projectPath, projectStore.project.sourceId);
  }

  function handleOpenProjectFolder(): void {
    store.openProjectFolder(projectStore.projectPath, projectStore.project.sourceId);
  }

  function handleOpenProjectTerminal(): void {
    store.openProjectTerminal(projectStore.projectPath, projectStore.project.sourceId);
  }

  function handleOpenRenameDialog(): void {
    setDisplayNameDraft(projectStore.displayName);
    setIsRenameDialogOpen(true);
  }

  function handleOpenProjectActions(event: MouseEvent<HTMLButtonElement>): void {
    setProjectActionsAnchor(event.currentTarget);
  }

  function handleCloseProjectActions(): void {
    setProjectActionsAnchor(null);
  }

  function handleRenameFromMenu(): void {
    handleCloseProjectActions();
    handleOpenRenameDialog();
  }

  function handleOpenProjectFromMenu(): void {
    handleCloseProjectActions();
    handleOpenProject();
  }

  function handleOpenProjectFolderFromMenu(): void {
    handleCloseProjectActions();
    handleOpenProjectFolder();
  }

  function handleOpenProjectTerminalFromMenu(): void {
    handleCloseProjectActions();
    handleOpenProjectTerminal();
  }

  function handleOpenStatisticsFromMenu(): void {
    handleCloseProjectActions();
    setIsStatisticsDialogOpen(true);
  }

  function handleCloseStatisticsDialog(): void {
    setIsStatisticsDialogOpen(false);
  }

  function handleRefreshThreadsFromMenu(): void {
    handleCloseProjectActions();
    handleRefreshThreads();
  }

  function handleCloseRenameDialog(): void {
    if (isSavingDisplayName) {
      return;
    }

    setIsRenameDialogOpen(false);
  }

  function handleDisplayNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setDisplayNameDraft(event.target.value);
  }

  function handleResetDisplayName(): void {
    void saveProjectDisplayName(null);
  }

  function handleSubmitDisplayName(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const nextDisplayName = displayNameDraft.trim();
    void saveProjectDisplayName(nextDisplayName.length === 0 ? null : nextDisplayName);
  }

  async function saveProjectDisplayName(displayName: string | null): Promise<void> {
    setIsSavingDisplayName(true);

    try {
      await store.projectsStore.updateProjectDisplayName(projectStore.project.id, displayName);
      setIsRenameDialogOpen(false);
    } finally {
      setIsSavingDisplayName(false);
    }
  }

  function handleOpenSources(): void {
    store.openSourcesHome();
  }

  function handleShowActiveThreads(): void {
    threadListStore.setShowingArchivedThreads(false);
  }

  function handleShowArchivedThreads(): void {
    threadListStore.setShowingArchivedThreads(true);
  }

  const archiveToggleLabel = threadListStore.isShowingArchivedThreads
    ? t("sidebar.showActiveChats")
    : t("sidebar.showArchivedChats");
  const handleArchiveToggle = threadListStore.isShowingArchivedThreads
    ? handleShowActiveThreads
    : handleShowArchivedThreads;
  const shouldShowArchiveToggle = threadListStore.isShowingArchivedThreads ||
    threadListStore.hasArchivedThreads;

  return (
    <aside className="thread-list">
      <header className="side-header project-sidebar-header">
        <Box className="project-sidebar-title" sx={{ minWidth: 0 }}>
          <Box className="project-sidebar-title-row">
            <Typography variant="h6" component="h1" noWrap>
              {projectStore.displayName}
            </Typography>
            <Stack className="project-sidebar-hover-actions" direction="row" spacing={0.5}>
              <IconButton
                className={`project-sidebar-hover-action${projectActionsAnchor !== null ? " is-open" : ""}`}
                aria-label={t("sidebar.projectActions")}
                aria-haspopup="menu"
                aria-expanded={projectActionsAnchor !== null ? "true" : undefined}
                title={t("sidebar.projectActions")}
                size="small"
                onClick={handleOpenProjectActions}
              >
                <MoreVertOutlinedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack className="project-sidebar-header-actions" direction="row" spacing={0.5}>
              <Tooltip title={t("sidebar.openNewChat")}>
                <IconButton
                  aria-label={t("sidebar.openNewChat")}
                  color="primary"
                  size="small"
                  disabled={isReadOnlyProject}
                  onClick={handleNewThread}
                >
                  <AddOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
          <Typography variant="caption" component="div" color="text.secondary" noWrap>
            {projectStore.projectPath}
          </Typography>
        </Box>
        <Menu
          anchorEl={projectActionsAnchor}
          open={projectActionsAnchor !== null}
          onClose={handleCloseProjectActions}
        >
          <MenuItem onClick={handleRenameFromMenu}>
            <ListItemIcon>
              <EditOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("sidebar.editProjectName")}</ListItemText>
          </MenuItem>
          <MenuItem disabled={!canOpenProject} onClick={handleOpenProjectFromMenu}>
            <ListItemIcon>
              <OpenInNewOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("sidebar.openProject")}</ListItemText>
          </MenuItem>
          <MenuItem
            disabled={!canUseLocalProjectActions}
            onClick={handleOpenProjectFolderFromMenu}
          >
            <ListItemIcon>
              <FolderOpenOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("sidebar.openProjectFolder")}</ListItemText>
          </MenuItem>
          <MenuItem
            disabled={!canUseLocalProjectActions}
            onClick={handleOpenProjectTerminalFromMenu}
          >
            <ListItemIcon>
              <TerminalOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("sidebar.openProjectTerminal")}</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleOpenStatisticsFromMenu}>
            <ListItemIcon>
              <BarChartOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("sidebar.projectStatistics")}</ListItemText>
          </MenuItem>
          <MenuItem disabled={isReadOnlyProject} onClick={handleRefreshThreadsFromMenu}>
            <ListItemIcon>
              <RefreshOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t("sidebar.refresh")}</ListItemText>
          </MenuItem>
        </Menu>
      </header>

      <Dialog open={isRenameDialogOpen} fullWidth maxWidth="xs" onClose={handleCloseRenameDialog}>
        <Box component="form" onSubmit={handleSubmitDisplayName}>
          <DialogTitle>{t("sidebar.editProjectNameTitle")}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={1.5}>
              <TextField
                autoFocus
                fullWidth
                size="small"
                label={t("sidebar.projectName")}
                value={displayNameDraft}
                disabled={isSavingDisplayName}
                onChange={handleDisplayNameChange}
              />
              <Typography variant="caption" color="text.secondary">
                {projectStore.project.defaultName}
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              type="button"
              color="inherit"
              disabled={isSavingDisplayName}
              onClick={handleResetDisplayName}
            >
              {t("sidebar.resetProjectName")}
            </Button>
            <Box sx={{ flex: "1 1 auto" }} />
            <Button type="button" disabled={isSavingDisplayName} onClick={handleCloseRenameDialog}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="contained" disabled={isSavingDisplayName}>
              {t("sidebar.saveProjectName")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <ProjectStatisticsDialogX
        open={isStatisticsDialogOpen}
        projectPath={projectStore.projectPath}
        sourceId={projectStore.project.sourceId}
        store={store}
        onClose={handleCloseStatisticsDialog}
      />

      {isReadOnlyProject ? (
        <Alert
          severity="warning"
          sx={{ mx: 1.5, mb: 1 }}
          action={(
            <Button color="inherit" size="small" onClick={handleOpenSources}>
              {t("sources.title")}
            </Button>
          )}
        >
          {sourceWarning}
        </Alert>
      ) : null}

      <Box sx={{ px: 1.5, pb: 1.25 }}>
        <TextField
          type="search"
          placeholder={t("sidebar.search")}
          value={threadListStore.searchTerm}
          fullWidth
          size="small"
          onChange={handleSearch}
        />
        {shouldShowArchiveToggle ? (
          <Button
            fullWidth
            size="small"
            startIcon={threadListStore.isShowingArchivedThreads ? <ArrowBackOutlinedIcon /> : null}
            variant={threadListStore.isShowingArchivedThreads ? "contained" : "text"}
            sx={{ mt: 0.75 }}
            disabled={isReadOnlyProject}
            onClick={handleArchiveToggle}
          >
            {archiveToggleLabel}
          </Button>
        ) : null}
      </Box>

      {threadListStore.isLoadingThreads ? (
        <LinearProgress sx={{ mx: 1.5, mb: 1 }} />
      ) : null}

      <div className="thread-groups">
        {threadListStore.filteredThreads.map((thread) => (
          <ThreadButtonX
            key={thread.id}
            projectStore={projectStore}
            root={store}
            thread={thread}
            onOpenSubAgentDialog={onOpenSubAgentDialog}
          />
        ))}
      </div>
      {projectStore.hasSyncingChat ? (
        <Stack
          className="project-sidebar-sync"
          direction="row"
          spacing={0.75}
          sx={{ alignItems: "center" }}
        >
          <CircularProgress size={12} thickness={5} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {t("chat.syncing")}
          </Typography>
        </Stack>
      ) : null}
      <UsageLimitsWidgetX store={store.usageStore} />
    </aside>
  );
}

export const ProjectThreadListX = observer(ProjectThreadList);
