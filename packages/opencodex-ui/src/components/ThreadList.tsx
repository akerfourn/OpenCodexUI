import {
  Box,
  Button,
  LinearProgress,
  MenuItem,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexLanguage, OpenCodexThread, OpenCodexThreadScope } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { ThreadButtonX } from "./ThreadButton";

type ThreadListProps = {
  store: RootStore;
};

export function ThreadList({ store }: ThreadListProps) {
  const { t } = useTranslation();
  const groups = groupThreadsByProject(store.filteredThreads, t("sidebar.otherChats"));

  function handleSearch(event: ChangeEvent<HTMLInputElement>): void {
    store.setSearchTerm(event.target.value);
  }

  function handleNewThread(): void {
    store.createThread();
  }

  function handleLanguageChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setLanguage(event.target.value as OpenCodexLanguage);
  }

  const filterNotice = !store.currentProjectFilterAvailable && store.scope === "currentProject"
    ? t("sidebar.filterNotice")
    : null;

  return (
    <aside className="thread-list">
      <header className="side-header">
        <Typography variant="h6" component="h1">
          OpenCodexUI
        </Typography>
        <Button variant="contained" type="button" onClick={handleNewThread}>
          {t("sidebar.new")}
        </Button>
      </header>
      <Box sx={{ px: 1.5, pb: 1.25 }}>
        <TextField
          select
          value={store.settings.language}
          label={t("language.label")}
          fullWidth
          size="small"
          onChange={handleLanguageChange}
        >
          <MenuItem value="system">{t("language.system")}</MenuItem>
          <MenuItem value="fr">{t("language.fr")}</MenuItem>
          <MenuItem value="en">{t("language.en")}</MenuItem>
        </TextField>
      </Box>

      <Tabs
        value={store.scope}
        aria-label={t("sidebar.filterTabs")}
        variant="fullWidth"
        sx={{ px: 1.5, pb: 1.25 }}
        onChange={(_event, value: OpenCodexThreadScope) => {
          store.setScope(value);
        }}
      >
        <Tab value="currentProject" label={t("sidebar.currentProject")} />
        <Tab value="all" label={t("sidebar.allChats")} />
      </Tabs>

      <Box sx={{ px: 1.5, pb: 1.25 }}>
        <TextField
          type="search"
          placeholder={t("sidebar.search")}
          value={store.searchTerm}
          fullWidth
          size="small"
          onChange={handleSearch}
        />
      </Box>

      {filterNotice !== null ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, pb: 1.25 }}>
          {filterNotice}
        </Typography>
      ) : null}

      {store.isLoadingThreads ? (
        <LinearProgress sx={{ mx: 1.5, mb: 1 }} />
      ) : null}

      <div className="thread-groups">
        {groups.map((group) => (
          <section className="thread-group" key={group.project}>
            <Typography
              variant="overline"
              component="div"
              sx={{ display: "block", px: 0.5, pt: 1.75, pb: 0.75 }}
            >
            {group.project}
            </Typography>
            {group.threads.map((thread) => (
              <ThreadButtonX key={thread.id} store={store} thread={thread} />
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

export const ThreadListX = observer(ThreadList);

type ThreadProjectGroup = {
  project: string;
  threads: OpenCodexThread[];
};

function groupThreadsByProject(threads: OpenCodexThread[], fallbackProjectName: string): ThreadProjectGroup[] {
  const projects = new Map<string, OpenCodexThread[]>();

  for (const thread of threads) {
    const projectName = thread.projectPath ?? fallbackProjectName;
    const projectThreads = projects.get(projectName) ?? [];
    projectThreads.push(thread);
    projects.set(projectName, projectThreads);
  }

  return Array.from(projects.entries()).map(([project, projectThreads]) => ({
    project,
    threads: projectThreads
  }));
}
