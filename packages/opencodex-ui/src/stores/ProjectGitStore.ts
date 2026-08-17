/**
 * Holds Git state for one opened project.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexGitStatus,
  OpenCodexProject,
  OpenCodexProjectPreferences,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import type { AppSettingsStore } from "./AppSettingsStore";
import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";
import { ProjectGitCommitStore } from "./ProjectGitCommitStore";
import { ProjectGitChangesStore } from "./ProjectGitChangesStore";
import { ProjectGitLogStore } from "./ProjectGitLogStore";
import type { ProjectGitLogContext } from "./ProjectGitLogStore";
import { ProjectGitReferencesStore } from "./ProjectGitReferencesStore";
import { ProjectGitStatusStore } from "./ProjectGitStatusStore";
import { ProjectGitTagStore } from "./ProjectGitTagStore";
import type { ProjectGitTagContext } from "./ProjectGitTagStore";

/**
 * Stores Git status and actions for a project.
 */
export class ProjectGitStore {
  /** Current Git status and repository lifecycle state for the project. */
  readonly statusStore: ProjectGitStatusStore;
  /** Changed and staged file workflow state for the project. */
  readonly changesStore: ProjectGitChangesStore;
  /** Commit message editor and commit actions for the project. */
  readonly commitStore: ProjectGitCommitStore;
  /** Git branches, remotes, and remote synchronization actions for the project. */
  readonly referencesStore: ProjectGitReferencesStore;
  /** Paginated Git history and commit details for this project. */
  readonly logStore: ProjectGitLogStore;
  /** Local and remote Git tag state for this project. */
  readonly tagStore: ProjectGitTagStore;
  /** Last generic Git error shown by the panel. */
  errorMessage: string | null = null;

  /**
   * Creates the Git store for one project.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    this.statusStore = new ProjectGitStatusStore(this);
    this.changesStore = new ProjectGitChangesStore(this);
    this.commitStore = new ProjectGitCommitStore(this);
    this.referencesStore = new ProjectGitReferencesStore(this);
    const projectGitStore = this;
    const logContext: ProjectGitLogContext = {
      get isAvailable() {
        return projectStore.isCodexSourceReady;
      },
      get isRepository() {
        return projectGitStore.statusStore.isRepository;
      },
      get projectPath() {
        return projectStore.projectPath;
      },
      get sourceId() {
        return projectStore.project.sourceId;
      },
      request<TResponse>(request: OpenCodexRequest): Promise<TResponse> {
        return root.request<TResponse>(request);
      }
    };
    this.logStore = new ProjectGitLogStore(logContext);

    const tagContext: ProjectGitTagContext = {
      get isAvailable() {
        return projectStore.isCodexSourceReady;
      },
      get isRepository() {
        return projectGitStore.statusStore.isRepository;
      },
      get projectPath() {
        return projectStore.projectPath;
      },
      get sourceId() {
        return projectStore.project.sourceId;
      },
      get projectId() {
        return projectStore.project.id;
      },
      get preferences() {
        return projectStore.project.preferences;
      },
      request<TResponse>(request: OpenCodexRequest): Promise<TResponse> {
        return root.request<TResponse>(request);
      },
      reportWarning(message: string): void {
        projectGitStore.reportWarning(message);
      },
      setProject(project: OpenCodexProject): void {
        projectStore.setProject(project);
      }
    };
    this.tagStore = new ProjectGitTagStore(tagContext);

    makeAutoObservable<ProjectGitStore, "projectStore" | "root" | "statusStore" | "changesStore" | "commitStore" | "referencesStore" | "logStore" | "tagStore">(
      this,
      {
        projectStore: false,
        root: false,
        statusStore: false,
        changesStore: false,
        commitStore: false,
        referencesStore: false,
        logStore: false,
        tagStore: false
      },
      {
        autoBind: true
      }
    );
    this.applyProjectPreferences(projectStore.project.preferences);
  }

  /** Whether Git actions can run for the project source. */
  get isAvailable(): boolean {
    return this.projectStore.isCodexSourceReady;
  }

  /** Returns the project path used by Git requests. */
  get projectPath(): string {
    return this.projectStore.projectPath;
  }

  /** Returns the source identifier used by Git requests. */
  get sourceId(): string | null {
    return this.projectStore.project.sourceId;
  }

  /** Returns the project identifier used by project metadata requests. */
  get projectId(): string {
    return this.projectStore.project.id;
  }

  /** Returns the current project preferences used as an update base. */
  get projectPreferences(): OpenCodexProjectPreferences {
    return this.projectStore.project.preferences;
  }

  /** Returns the application settings service used by Git workflows. */
  get settingsStore(): AppSettingsStore {
    return this.root.appStore.settingsStore;
  }

  /** Applies project metadata returned by a preference update. */
  setProject(project: OpenCodexProject): void {
    this.projectStore.setProject(project);
  }

  /** Sends one request through the owning backend transport. */
  request<TResponse>(request: OpenCodexRequest): Promise<TResponse> {
    return this.root.request<TResponse>(request);
  }

  /**
   * Applies Git preferences to the child stores that consume them.
   *
   * @param preferences Project preferences.
   */
  applyProjectPreferences(preferences: OpenCodexProjectPreferences): void {
    this.changesStore.applyProjectPreferences(preferences);
    this.tagStore.applyProjectPreferences(preferences);
  }

  /**
   * Reconciles project-local Git state after a status snapshot is applied.
   *
   * @param status Git status snapshot.
   */
  reconcileStatus(status: OpenCodexGitStatus): void {
    this.commitStore.reconcileStatus(status);
    this.changesStore.reconcileStatus(status);
  }

  /** Reports a non-fatal warning to the project UI and log. */
  private reportWarning(message: string): void {
    this.root.appStore.showWarningMessage(message);
    void this.root.request({
      type: "logs.create",
      logType: "warning",
      message,
      details: {
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      }
    });
  }
}
