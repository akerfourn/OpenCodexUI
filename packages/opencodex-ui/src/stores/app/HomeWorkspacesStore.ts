import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexProject, OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import { HomeWorkspaceProjectStore } from "./HomeWorkspaceProjectStore";

export type HomeWorkspaceFilter = "all" | "active" | "completed" | "candidate" | "pending";

/** Application inventory reads cached projects without opening every project tab. */
export class HomeWorkspacesStore {
  /** Child inventories retain explicit per-project source and filesystem identities. */
  readonly projects = new Map<string, HomeWorkspaceProjectStore>();
  /** Text filtering never triggers a new scan. */
  search = "";
  /** An empty source filter includes offline and orphan projects. */
  sourceId = "";
  /** Presentation filter is separate from the manually declared work status. */
  filter: HomeWorkspaceFilter = "all";
  /** Hidden projects are opt-in, as on the ordinary Home project list. */
  showHidden = false;
  /** Serializes refreshes across this inventory's project batches. */
  isLoading = false;
  /** A failed catalogue read must not authorize cleanup from stale evidence. */
  error: string | null = null;
  /** Cancels remaining batches when Home is unmounted or a newer load takes over. */
  private generation = 0;

  /** Owns UI state only; all transport payloads are literal scalar DTOs. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<HomeWorkspacesStore, "root">(this, { root: false }, { autoBind: true });
  }

  /** Project metadata filters remain independent of whichever project tab is active. */
  get visibleProjects(): HomeWorkspaceProjectStore[] {
    return [...this.projects.values()].filter(owner => (this.showHidden || !owner.project.isHidden)
      && (this.sourceId === "" || owner.project.sourceId === this.sourceId))
      .filter(owner => this.search.length === 0 || this.projectMatches(owner)
        || this.entriesFor(owner).length > 0);
  }

  /** Filters rows without hiding a project's independent pending-creation journal. */
  entriesFor(owner: HomeWorkspaceProjectStore): OpenCodexProjectWorkspace[] {
    const query = this.search.trim().toLocaleLowerCase();
    const projectMatches = this.projectMatches(owner);
    return owner.entries.filter(workspace => {
      if (query.length > 0 && !projectMatches
        && !`${workspace.name ?? ""} ${workspace.path}`.toLocaleLowerCase().includes(query)) return false;
      if (this.filter === "active") return !workspace.isPrimary && workspace.workStatus !== "completed";
      if (this.filter === "completed") return !workspace.isPrimary && workspace.workStatus === "completed";
      if (this.filter === "candidate") return owner.statusFor(workspace) === "candidate";
      if (this.filter === "pending") return owner.hasPending(workspace);
      return true;
    });
  }

  /** Matches human labels and source-local project paths. */
  private projectMatches(owner: HomeWorkspaceProjectStore): boolean {
    return `${owner.project.displayName ?? owner.project.defaultName} ${owner.project.path}`
      .toLocaleLowerCase().includes(this.search.trim().toLocaleLowerCase());
  }

  /** Updates the inventory query without requesting new source data. */
  setSearch(value: string): void { this.search = value; }
  /** Chooses an explicit source filter; an empty value includes orphan projects. */
  setSourceId(value: string): void { this.sourceId = value; }
  /** Changes presentation without interpreting an unknown state as a cleanup candidate. */
  setFilter(value: HomeWorkspaceFilter): void { this.filter = value; }
  /** Keeps intentionally hidden projects opt-in. */
  setShowHidden(value: boolean): void { this.showHidden = value; }

  /** Initial load reads cache only; explicit refresh additionally verifies source folders. */
  async load(verifySources = false): Promise<void> {
    if (this.isLoading) return;
    const generation = ++this.generation;
    this.isLoading = true;
    this.error = null;
    try {
      const projects = await this.root.request<OpenCodexProject[]>({ type: "projects.list" });
      if (generation !== this.generation) return;
      runInAction(() => {
        for (const [id, owner] of this.projects) {
          if (!projects.some(project => project.id === id)) {
            owner.dispose();
            this.projects.delete(id);
          }
        }
        for (const project of projects) {
          if (!this.projects.has(project.id)) this.projects.set(project.id, new HomeWorkspaceProjectStore(project, this.root));
        }
      });
      // Source scans are bounded across projects as well as within each inventory.
      for (const project of projects) {
        if (generation !== this.generation) return;
        const visibleSource = this.sourceId === "" || project.sourceId === this.sourceId;
        const visibleProject = this.showHidden || !project.isHidden;
        await this.projects.get(project.id)!.load(verifySources && visibleSource && visibleProject);
      }
    } catch (error) {
      runInAction(() => { if (generation === this.generation) this.error = String(error); });
    } finally {
      runInAction(() => { if (generation === this.generation) this.isLoading = false; });
    }
  }

  /** Stops queued work and pending source publication when leaving Home. */
  dispose(): void {
    this.generation += 1;
    this.isLoading = false;
    for (const owner of this.projects.values()) owner.dispose();
  }
}
