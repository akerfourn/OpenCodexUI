import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexGitStatus, OpenCodexProject } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import { isPathDeferred } from "../project/git/gitDeferredPaths";

type ProjectScope = Pick<OpenCodexProject, "id" | "sourceId" | "path">;

/** Small, dated summaries for the principal folder, filtered by current project preferences. */
export interface HomeProjectGitSnapshot {
  project: ProjectScope;
  isRepository: boolean;
  hasChanges: boolean;
  aheadCount: number;
  branchName: string | null;
  checkedAt: number;
  failed: boolean;
  generation: number;
}

/** Relative paths let preference changes update summaries without retaining full statuses or rereading Git. */
interface HomeProjectGitObservation extends Omit<HomeProjectGitSnapshot, "hasChanges"> {
  changedPaths: string[];
  hasStagedChanges: boolean;
}

/** Checks visible Home rows with local Git reads, without opening tabs or starting offline sources. */
export class HomeProjectGitStore {
  /** Source/path identity is part of every cached observation. */
  private readonly snapshots = new Map<string, HomeProjectGitObservation>();
  /** Reference counts support multiple views without duplicating their requests. */
  private readonly visible = new Map<string, { project: ProjectScope; users: number }>();
  /** Unstarted work is removed as soon as its row leaves the viewport. */
  private readonly queue = new Set<string>();
  /** At most two source requests can be active across all Home projects. */
  private readonly inFlight = new Set<string>();
  /** A newer Git-panel observation always wins over a pending Home response. */
  private readonly revisions = new Map<string, number>();
  /** Explicit Home visits invalidate prior observations even before rows enter the viewport. */
  private generation = 0;

  /** The clock is injectable so cache expiry does not depend on real time in tests. */
  constructor(private readonly root: RootStore, private readonly now: () => number = Date.now) {
    makeAutoObservable<HomeProjectGitStore, "root" | "now" | "visible" | "queue" | "inFlight" | "revisions">(
      this, { root: false, now: false, visible: false, queue: false, inFlight: false, revisions: false },
      { autoBind: true }
    );
  }

  /** Uses the application's existing Git terminology preference. */
  get vocabulary(): "simple" | "technical" {
    return this.root.appStore.settingsStore.settings.versioningVocabulary;
  }

  /** Never resolves a project through the globally selected source or workspace. */
  isAvailable(project: ProjectScope): boolean {
    if (project.sourceId === null || !this.root.sourcesStore.isSourceReady(project.sourceId)) return false;
    const instance = this.root.sourceInstancesStore.states.get(project.sourceId);
    return instance?.manuallyStopped !== true && instance?.phase !== "stopping" && instance?.phase !== "updating";
  }

  /** Applies live deferrals to cached paths while keeping source identity and staged changes explicit. */
  snapshotFor(project: ProjectScope): HomeProjectGitSnapshot | undefined {
    const current = this.root.projectsStore.projects.find(item => item.id === project.id
      && item.sourceId === project.sourceId && item.path === project.path);
    if (current === undefined || !this.isAvailable(project)) return undefined;
    const observation = this.snapshots.get(projectKey(project));
    if (observation === undefined) return undefined;
    const { changedPaths, hasStagedChanges, ...snapshot } = observation;
    const deferredPaths = current.preferences.git?.deferredPaths ?? [];
    return { ...snapshot,
      hasChanges: hasStagedChanges || changedPaths.some(path => !isPathDeferred(path, deferredPaths))
    };
  }

  /** Starts observing a visible row, reusing observations younger than one minute. */
  watch(project: ProjectScope): () => void {
    const scope = { id: project.id, sourceId: project.sourceId, path: project.path };
    const key = projectKey(scope);
    const watched = this.visible.get(key);
    this.visible.set(key, { project: scope, users: (watched?.users ?? 0) + 1 });
    this.enqueue(scope, false);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.visible.get(key);
      if (current === undefined) return;
      current.users -= 1;
      if (current.users === 0) {
        this.visible.delete(key);
        this.queue.delete(key);
      }
    };
  }

  /** Home entry and its refresh action can explicitly bypass the short cache. */
  refreshVisible(force = false): void {
    if (force) this.generation += 1;
    for (const { project } of this.visible.values()) this.enqueue(project, force);
  }

  /** Shares successful primary-folder observations from commits, pushes and Git panel refreshes. */
  record(projectId: string, path: string, sourceId: string | null, status: OpenCodexGitStatus): void {
    const project = { id: projectId, path, sourceId };
    if (!this.isCurrent(project)) return;
    const key = projectKey(project);
    this.revisions.set(key, (this.revisions.get(key) ?? 0) + 1);
    this.snapshots.set(key, {
      project, isRepository: status.isRepository, aheadCount: status.aheadCount,
      branchName: status.branchName,
      changedPaths: status.changedFiles.map(file => file.path), hasStagedChanges: status.stagedFiles.length > 0,
      checkedAt: this.now(), failed: false, generation: this.generation
    });
  }

  /** Drops retained observations when projects are deleted, moved or reassigned to another source. */
  reconcile(): void {
    for (const [key, snapshot] of this.snapshots) {
      if (!this.isCurrent(snapshot.project)) {
        this.snapshots.delete(key);
        this.revisions.delete(key);
      }
    }
  }

  /** Queues only requested, available scopes and never duplicates a pending check. */
  private enqueue(project: ProjectScope, force: boolean): void {
    if (!this.isCurrent(project) || !this.isAvailable(project)) return;
    const key = projectKey(project);
    const cached = this.snapshots.get(key);
    if (!force && cached !== undefined && this.isFresh(cached)) return;
    if (this.inFlight.has(key)) return;
    this.queue.add(key);
    this.pump();
  }

  /** Bounds actual source requests, including while filters and visibility change. */
  private pump(): void {
    while (this.inFlight.size < 2 && this.queue.size > 0) {
      const key = this.queue.values().next().value!;
      this.queue.delete(key);
      const watched = this.visible.get(key);
      if (watched === undefined || !this.isCurrent(watched.project) || !this.isAvailable(watched.project)) continue;
      const cached = this.snapshots.get(key);
      if (cached !== undefined && this.isFresh(cached)) continue;
      this.inFlight.add(key);
      void this.check(watched.project).finally(() => {
        this.inFlight.delete(key);
        this.pump();
      });
    }
  }

  /** Reads existing source-local Git status; no fetch, tag loading, diff or project opening is requested. */
  private async check(project: ProjectScope): Promise<void> {
    const key = projectKey(project);
    const revision = this.revisions.get(key) ?? 0;
    try {
      const status = await this.root.request<OpenCodexGitStatus>({
        type: "git.status", sourceId: project.sourceId, projectPath: project.path
      });
      if (!this.isCurrent(project) || revision !== (this.revisions.get(key) ?? 0)) return;
      runInAction(() => this.record(project.id, project.path, project.sourceId, status));
    } catch {
      runInAction(() => {
        if (!this.isCurrent(project) || revision !== (this.revisions.get(key) ?? 0)) return;
        this.snapshots.set(key, {
          project, isRepository: false, changedPaths: [], hasStagedChanges: false, aheadCount: 0, branchName: null,
          checkedAt: this.now(), failed: true, generation: this.generation
        });
      });
    }
  }

  /** Late replies must still match the principal folder in the current project catalogue. */
  private isCurrent(scope: ProjectScope): boolean {
    return this.root.projectsStore.projects.some(project => project.id === scope.id
      && project.path === scope.path && project.sourceId === scope.sourceId);
  }

  /** A fresh observation belongs to this Home visit and has a bounded reuse period. */
  private isFresh(snapshot: HomeProjectGitObservation): boolean {
    return snapshot.generation === this.generation && this.now() - snapshot.checkedAt < 60_000;
  }
}

/** Keeps identical paths on different sources and changed project identities separate. */
function projectKey(project: ProjectScope): string {
  return JSON.stringify([project.id, project.sourceId, project.path]);
}
