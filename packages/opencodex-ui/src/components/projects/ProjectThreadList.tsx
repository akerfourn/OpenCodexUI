/**
 * Renders the chat list for one opened project.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import OpenInNewOutlinedIcon from "@mui/icons-material/OpenInNewOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Alert, Box, Button, CircularProgress, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ThreadButtonX } from "../threads/ThreadButton";
import { UsageLimitsWidgetX } from "../usage/UsageLimitsWidget";

type ProjectThreadListProps = {
  store: RootStore;
  projectStore: ProjectStore;
};

/**
 * Renders a project chat list.
 *
 * @param props Component props.
 *
 * @returns Rendered thread list.
 */
export function ProjectThreadList({ store, projectStore }: ProjectThreadListProps) {
  const { t } = useTranslation();
  const threadListStore = projectStore.threadListStore;
  const source = store.sourcesStore.sources.find((entry) => entry.id === projectStore.project.sourceId);
  const isReadOnlyProject = projectStore.isReadOnlyFromCache;
  const canOpenProject = source?.settings.openFolderCommand !== null &&
    source?.settings.openFolderCommand !== undefined;
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
                className="project-sidebar-hover-action"
                aria-label={t("sidebar.openProject")}
                title={t("sidebar.openProject")}
                size="small"
                disabled={!canOpenProject}
                onClick={handleOpenProject}
              >
                <OpenInNewOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton
                className="project-sidebar-hover-action"
                aria-label={t("sidebar.refresh")}
                title={t("sidebar.refresh")}
                size="small"
                disabled={isReadOnlyProject}
                onClick={handleRefreshThreads}
              >
                <RefreshOutlinedIcon fontSize="small" />
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
      </header>

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
          <ThreadButtonX key={thread.id} projectStore={projectStore} thread={thread} />
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
