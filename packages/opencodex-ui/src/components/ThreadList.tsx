import { observer } from "mobx-react-lite";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";

type ThreadListProps = {
  store: RootStore;
};

export const ThreadList = observer(function ThreadList({ store }: ThreadListProps) {
  const groups = groupThreadsByProject(store.threads);

  function handleCurrentProjectScope(): void {
    store.setScope("currentProject");
  }

  function handleAllScope(): void {
    store.setScope("all");
  }

  function handleSearch(event: React.ChangeEvent<HTMLInputElement>): void {
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
        <h1>OpenCodexUI</h1>
        <button className="primary-button" type="button" onClick={handleNewThread}>
          Nouveau
        </button>
      </header>

      <div className="segmented-control" aria-label="Filtre des conversations">
        <button
          className={store.scope === "currentProject" ? "active" : ""}
          type="button"
          onClick={handleCurrentProjectScope}
        >
          Projet courant
        </button>
        <button
          className={store.scope === "all" ? "active" : ""}
          type="button"
          onClick={handleAllScope}
        >
          Tous les chats
        </button>
      </div>

      <input
        className="search-input"
        type="search"
        placeholder="Rechercher"
        value={store.searchTerm}
        onChange={handleSearch}
      />

      {filterNotice !== null ? <p className="notice">{filterNotice}</p> : null}

      <div className="thread-groups">
        {groups.map((group) => (
          <section className="thread-group" key={group.project}>
            <h2>{group.project}</h2>
            {group.branches.map((branchGroup) => (
              <div className="branch-group" key={branchGroup.branch ?? "default"}>
                {branchGroup.branch !== null ? <h3>{branchGroup.branch}</h3> : null}
                <div className={branchGroup.branch !== null ? "branch-threads" : undefined}>
                  {branchGroup.threads.map((thread) => (
                    <ThreadButton key={thread.id} store={store} thread={thread} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
});

type ThreadButtonProps = {
  store: RootStore;
  thread: OpenCodexThread;
};

const ThreadButton = observer(function ThreadButton({ store, thread }: ThreadButtonProps) {
  function handleOpenThread(): void {
    store.openThread(thread.id);
  }

  const isActive = store.currentThread?.id === thread.id;

  return (
    <button
      className={isActive ? "thread-button active" : "thread-button"}
      type="button"
      onClick={handleOpenThread}
    >
      <span className="chat-row">
        <svg className="chat-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 17 0Z" />
        </svg>
        <span>{getThreadTitle(thread)}</span>
      </span>
      {thread.branchName !== null ? <small>{thread.branchName}</small> : null}
    </button>
  );
});

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

function getThreadTitle(thread: OpenCodexThread): string {
  if (thread.title.trim().length > 0) {
    return thread.title;
  }

  if (thread.preview.trim().length > 0) {
    return thread.preview;
  }

  return "Conversation sans titre";
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
