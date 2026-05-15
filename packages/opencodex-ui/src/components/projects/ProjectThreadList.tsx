/**
 * Renders the chat list for one opened project.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Alert, Box, Button, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography } from "@mui/material";
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

  function handleSearch(event: ChangeEvent<HTMLInputElement>): void {
    threadListStore.setSearchTerm(event.target.value);
  }

  function handleNewThread(): void {
    projectStore.createThread();
  }

  function handleRefreshThreads(): void {
    projectStore.refreshThreads();
  }

  function handleOpenSources(): void {
    store.openSourcesHome();
  }

  return (
    <aside className="thread-list">
      <header className="side-header">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h1" noWrap>
            {projectStore.displayName}
          </Typography>
          <Typography variant="caption" component="div" color="text.secondary" noWrap>
            {projectStore.projectPath}
          </Typography>
        </Box>
        <Stack className="project-sidebar-header-actions" direction="row" spacing={0.5}>
          <IconButton
            className="project-sidebar-refresh"
            aria-label={t("sidebar.refresh")}
            title={t("sidebar.refresh")}
            size="small"
            disabled={projectStore.isOrphan}
            onClick={handleRefreshThreads}
          >
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
          <Tooltip title={t("sidebar.openNewChat")}>
            <IconButton
              aria-label={t("sidebar.openNewChat")}
              color="primary"
              size="small"
              disabled={projectStore.isOrphan}
              onClick={handleNewThread}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </header>

      {projectStore.isOrphan ? (
        <Alert
          severity="warning"
          sx={{ mx: 1.5, mb: 1 }}
          action={(
            <Button color="inherit" size="small" onClick={handleOpenSources}>
              {t("sources.title")}
            </Button>
          )}
        >
          {t("project.orphanSource")}
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
      </Box>

      {threadListStore.isLoadingThreads ? (
        <LinearProgress sx={{ mx: 1.5, mb: 1 }} />
      ) : null}

      <div className="thread-groups">
        {threadListStore.filteredThreads.map((thread) => (
          <ThreadButtonX key={thread.id} projectStore={projectStore} thread={thread} />
        ))}
      </div>
      <UsageLimitsWidgetX store={store.usageStore} />
    </aside>
  );
}

export const ProjectThreadListX = observer(ProjectThreadList);
