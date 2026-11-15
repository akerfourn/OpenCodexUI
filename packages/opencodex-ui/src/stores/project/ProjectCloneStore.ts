import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexProject, OpenCodexSource } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import { resolveProjectOpenSourceId } from "./projectMapping";
import { readErrorMessage } from "./git/gitErrorMessage";

/** Keeps an import's explicit source and inputs stable until cloning finishes. */
export class ProjectCloneStore {
  /** Git address copied by the user, independent of the destination folder. */
  repositoryUrl = "";
  /** Full destination in the selected source's filesystem. */
  destinationPath = "";
  /** Frozen import source, unaffected by changes to the Home filter. */
  sourceId = "";
  /** Whether Git is still cloning and the form must remain open. */
  isCloning = false;
  /** Whether the native empty-folder picker is open. */
  isPickingFolder = false;
  /** Technical diagnostic retained alongside the localized import error. */
  errorMessage: string | null = null;

  /** Uses the standard transport and source catalogue without observable DTOs. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<ProjectCloneStore, "root">(this, { root: false }, { autoBind: true });
  }

  /** Whether dismissal or another form operation would hide work in progress. */
  get isBusy(): boolean { return this.isCloning || this.isPickingFolder; }
  /** Source choices remain visible even when an installation is currently stopped. */
  get sources(): readonly OpenCodexSource[] { return this.root.sourcesStore.sources; }
  /** The native picker applies only to paths visible in the Electron host. */
  get canPickFolder(): boolean {
    const source = this.sources.find(item => item.id === this.sourceId);
    return source?.kind === "local" || (source?.kind === "custom" && source.settings.hasLocalAccess);
  }
  /** Prevents incomplete imports and stale source choices from reaching the backend. */
  get canClone(): boolean {
    return !this.isBusy && this.repositoryUrl.trim().length > 0 && this.destinationPath.trim().length > 0
      && this.sources.some(source => source.id === this.sourceId);
  }

  /** Starts each new import with the usual source and no stale address or path. */
  reset(): void {
    if (this.isBusy) return;
    this.repositoryUrl = "";
    this.destinationPath = "";
    this.errorMessage = null;
    this.sourceId = resolveProjectOpenSourceId(this.root.homeStore.selectedSourceId,
      this.root.settings.defaultSourceId, this.sources[0]?.id) ?? "";
  }
  /** Preserves user input while correcting a failed import. */
  setRepositoryUrl(value: string): void { if (!this.isBusy) this.repositoryUrl = value; }
  /** Accepts an explicit path without translating it into the host's filesystem. */
  setDestinationPath(value: string): void { if (!this.isBusy) this.destinationPath = value; }
  /** Clears a path from another filesystem whenever the user changes sources. */
  setSourceId(value: string): void {
    if (this.isBusy || this.sourceId === value) return;
    this.sourceId = value;
    this.destinationPath = "";
    this.errorMessage = null;
  }

  /** Picks a host-visible empty folder without registering a project prematurely. */
  async pickFolder(): Promise<void> {
    if (this.isBusy || !this.canPickFolder) return;
    this.isPickingFolder = true;
    this.errorMessage = null;
    try {
      const picked = await this.root.request<string | null>({ type: "projects.context.pickFolder" });
      if (typeof picked === "string") runInAction(() => { this.destinationPath = picked; });
    } catch (error) {
      runInAction(() => { this.errorMessage = readErrorMessage(error); });
    } finally {
      runInAction(() => { this.isPickingFolder = false; });
    }
  }

  /** Registers and opens the project through the backend's normal success event. */
  async clone(): Promise<boolean> {
    if (!this.canClone) return false;
    this.isCloning = true;
    this.errorMessage = null;
    try {
      await this.root.request<OpenCodexProject>({ type: "projects.clone", sourceId: this.sourceId,
        repositoryUrl: this.repositoryUrl.trim(), destinationPath: this.destinationPath.trim() });
      return true;
    } catch (error) {
      runInAction(() => { this.errorMessage = readErrorMessage(error); });
      return false;
    } finally {
      runInAction(() => { this.isCloning = false; });
    }
  }
}
