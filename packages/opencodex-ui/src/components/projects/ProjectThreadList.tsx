/**
 * Renders the chat list for one opened project.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Box, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ThreadButtonX } from "../threads/ThreadButton";

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

  function handleSearch(event: ChangeEvent<HTMLInputElement>): void {
    projectStore.setSearchTerm(event.target.value);
  }

  function handleNewThread(): void {
    store.createThread();
  }

  function handleRefreshThreads(): void {
    store.refreshThreads();
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
            onClick={handleRefreshThreads}
          >
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
          <Tooltip title={t("sidebar.openNewChat")}>
            <IconButton
              aria-label={t("sidebar.openNewChat")}
              color="primary"
              size="small"
              onClick={handleNewThread}
            >
              <AddOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </header>

      <Box sx={{ px: 1.5, pb: 1.25 }}>
        <TextField
          type="search"
          placeholder={t("sidebar.search")}
          value={projectStore.searchTerm}
          fullWidth
          size="small"
          onChange={handleSearch}
        />
      </Box>

      {projectStore.isLoadingThreads ? (
        <LinearProgress sx={{ mx: 1.5, mb: 1 }} />
      ) : null}

      <div className="thread-groups">
        {projectStore.filteredThreads.map((thread) => (
          <ThreadButtonX key={thread.id} store={store} thread={thread} />
        ))}
      </div>
    </aside>
  );
}

export const ProjectThreadListX = observer(ProjectThreadList);
