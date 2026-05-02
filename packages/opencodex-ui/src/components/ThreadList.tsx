import {
  Box,
  Button,
  LinearProgress,
  Tab,
  Tabs,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";

import type { OpenCodexThread, OpenCodexThreadScope } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { ThreadButtonX } from "./ThreadButton";

type ThreadListProps = {
  store: RootStore;
};

export function ThreadList({ store }: ThreadListProps) {
  const groups = groupThreadsByProject(store.filteredThreads);

  function handleSearch(event: ChangeEvent<HTMLInputElement>): void {
    store.setSearchTerm(event.target.value);
  }

  function handleNewThread(): void {
    store.createThread();
  }

  const filterNotice = !store.currentProjectFilterAvailable && store.scope === "currentProject"
    ? "Le filtrage par projet n'est pas disponible avec ce workspace."
    : null;

  return (
    <aside className="thread-list">
      <header className="side-header">
        <Typography variant="h6" component="h1">
          OpenCodexUI
        </Typography>
        <Button variant="contained" type="button" onClick={handleNewThread}>
          Nouveau
        </Button>
      </header>

      <Tabs
        value={store.scope}
        aria-label="Filtre des conversations"
        variant="fullWidth"
        sx={{ px: 1.5, pb: 1.25 }}
        onChange={(_event, value: OpenCodexThreadScope) => {
          store.setScope(value);
        }}
      >
        <Tab value="currentProject" label="Projet courant" />
        <Tab value="all" label="Tous les chats" />
      </Tabs>

      <Box sx={{ px: 1.5, pb: 1.25 }}>
        <TextField
          type="search"
          placeholder="Rechercher"
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
            {group.branches.map((branchGroup) => (
              <div className="branch-group" key={branchGroup.branch ?? "default"}>
                {branchGroup.branch !== null ? (
                  <Typography
                    variant="caption"
                    component="div"
                    sx={{ display: "block", pl: 2.25, pb: 0.5, fontStyle: "italic", fontWeight: 700 }}
                  >
                    {branchGroup.branch}
                  </Typography>
                ) : null}
                <div className={branchGroup.branch !== null ? "branch-threads" : undefined}>
                  {branchGroup.threads.map((thread) => (
                    <ThreadButtonX key={thread.id} store={store} thread={thread} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

export const ThreadListX = observer(ThreadList);

type ThreadBranchGroup = {
  branch: string | null;
  threads: OpenCodexThread[];
};

type ThreadProjectGroup = {
  project: string;
  branches: ThreadBranchGroup[];
};

function groupThreadsByProject(threads: OpenCodexThread[]): ThreadProjectGroup[] {
  const projects = new Map<string, Map<string, OpenCodexThread[]>>();

  for (const thread of threads) {
    const projectName = thread.projectPath ?? "Autres chats";
    const branchName = thread.branchName ?? "";
    const branches = getOrCreateMap(projects, projectName);
    const branchThreads = branches.get(branchName) ?? [];
    branchThreads.push(thread);
    branches.set(branchName, branchThreads);
  }

  return Array.from(projects.entries()).map(([project, branchMap]) => ({
    project,
    branches: Array.from(branchMap.entries()).map(([branch, branchThreads]) => ({
      branch: branch.length > 0 ? branch : null,
      threads: branchThreads
    }))
  }));
}

function getOrCreateMap(
  projects: Map<string, Map<string, OpenCodexThread[]>>,
  projectName: string
): Map<string, OpenCodexThread[]> {
  const existing = projects.get(projectName);

  if (existing !== undefined) {
    return existing;
  }

  const created = new Map<string, OpenCodexThread[]>();
  projects.set(projectName, created);
  return created;
}
