/**
 * Holds Git tag state and actions for one opened project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexGitTag,
  OpenCodexGitTagFetchResult,
  OpenCodexGitTagListResult,
  OpenCodexProject,
  OpenCodexProjectPreferences,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import { cloneProjectPreferences } from "./projectPreferencesDto";
import { readErrorMessage } from "./gitErrorMessage";

/** Backend and project state required by the Git tag store. */
export interface ProjectGitTagContext {
  /** Whether the source can execute Git requests. */
  readonly isAvailable: boolean;
  /** Whether the current project is a Git repository. */
  readonly isRepository: boolean;
  /** Current project path used by Git requests. */
  readonly projectPath: string;
  /** Current source identifier used by Git requests. */
  readonly sourceId: string | null;
  /** Current project identifier used by preference requests. */
  readonly projectId: string;
  /** Current project preferences used as the base for preference patches. */
  readonly preferences: OpenCodexProjectPreferences;
  /** Sends one request through the owning backend transport. */
  request<TResponse = unknown>(request: OpenCodexRequest): Promise<TResponse>;
  /** Reports a non-fatal warning to the owning project UI and log. */
  reportWarning(message: string): void;
  /** Applies project metadata returned by a preference update. */
  setProject(project: OpenCodexProject): void;
}

/**
 * Stores local and remote Git tags and release/reference actions.
 */
export class ProjectGitTagStore {
  /** Tags loaded for release/reference workflows. */
  tags: OpenCodexGitTag[] = [];
  /** Remote used to compare and publish the loaded tags. */
  tagsRemoteName: string | null = null;
  /** Tag selected as the reference point for commit distance. */
  selectedReferenceTagName: string | null = null;
  /** Number of commits since the selected reference tag. */
  commitsSinceReferenceTag: number | null = null;
  /** Last tag operation error shown by tag modals. */
  tagErrorMessage: string | null = null;
  /** Last remote tag synchronization error. */
  tagSyncErrorMessage: string | null = null;
  /** Whether tags have been loaded at least once. */
  hasLoadedTags = false;
  /** Whether tags are loading. */
  isLoadingTags = false;
  /** Whether remote tags are being fetched. */
  isFetchingTags = false;
  /** Whether a tag creation is in flight. */
  isCreatingTag = false;
  /** Tag currently being pushed, or `null` when no individual push is active. */
  pushingTagName: string | null = null;
  /** Whether all local tags are being pushed. */
  isPushingAllTags = false;
  /** Whether commits since the reference tag are loading. */
  isLoadingTagReference = false;

  /**
   * Creates a Git tag store with dynamic project and source state.
   *
   * @param context State getters and semantic project operations.
   */
  constructor(private readonly context: ProjectGitTagContext) {
    makeAutoObservable<ProjectGitTagStore, "context">(
      this,
      {
        context: false
      },
      {
        autoBind: true
      }
    );
  }

  /** Whether the project source can execute Git requests. */
  get isAvailable(): boolean {
    return this.context.isAvailable;
  }

  /** Whether the current project is a Git repository. */
  get isRepository(): boolean {
    return this.context.isRepository;
  }

  /** Whether at least one local tag can be pushed without force. */
  get canPushTags(): boolean {
    return (
      this.context.isRepository &&
      this.tagsRemoteName !== null &&
      this.tags.some((tag) => tag.syncStatus === "local-only" || tag.syncStatus === "diverged") &&
      this.pushingTagName === null &&
      !this.isPushingAllTags &&
      !this.isFetchingTags &&
      !this.isLoadingTags
    );
  }

  /**
   * Checks whether one tag can be pushed without force.
   *
   * @param tag Tag to inspect.
   * @returns Whether the tag has a known remote and needs publication.
   */
  canPushTag(tag: OpenCodexGitTag): boolean {
    return (
      this.tagsRemoteName !== null &&
      (tag.syncStatus === "local-only" || tag.syncStatus === "diverged") &&
      this.pushingTagName === null &&
      !this.isPushingAllTags &&
      !this.isFetchingTags &&
      !this.isLoadingTags
    );
  }

  /**
   * Checks whether a tag operation is currently active for one tag.
   *
   * @param tagName Tag name.
   * @returns Whether the tag is being pushed.
   */
  isPushingTag(tagName: string): boolean {
    return this.pushingTagName === tagName;
  }

  /**
   * Applies the reference tag preference from project metadata.
   *
   * @param preferences Project preferences.
   */
  applyProjectPreferences(preferences: OpenCodexProjectPreferences): void {
    const referenceTagName = normalizeNullableText(preferences.git?.referenceTagName ?? null);

    if (referenceTagName === this.selectedReferenceTagName) {
      return;
    }

    this.selectedReferenceTagName = referenceTagName;
    this.commitsSinceReferenceTag = null;

    if (referenceTagName !== null && this.context.isRepository) {
      void this.loadCommitsSinceReferenceTag(referenceTagName);
    }
  }

  /**
   * Loads local Git tags and updates the selected reference tag.
   *
   * @returns Promise resolved when tags are loaded.
   */
  async loadTags(): Promise<void> {
    if (!this.context.isAvailable || !this.context.isRepository) {
      this.tags = [];
      this.tagsRemoteName = null;
      this.tagSyncErrorMessage = null;
      this.selectedReferenceTagName = null;
      this.commitsSinceReferenceTag = null;
      this.hasLoadedTags = true;
      return;
    }

    this.isLoadingTags = true;
    this.tagErrorMessage = null;
    this.tagSyncErrorMessage = null;

    try {
      await this.refreshLocalTags();
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoadingTags = false;
        this.hasLoadedTags = true;
      });
    }
  }

  /**
   * Fetches tags from remotes and reloads local tag state.
   *
   * @returns Promise resolved when fetch completes.
   */
  async fetchTags(): Promise<void> {
    if (
      !this.context.isAvailable ||
      !this.context.isRepository ||
      this.isFetchingTags ||
      this.pushingTagName !== null ||
      this.isPushingAllTags
    ) {
      return;
    }

    this.isFetchingTags = true;
    this.tagErrorMessage = null;
    this.tagSyncErrorMessage = null;

    try {
      const result = await this.context.request<OpenCodexGitTagFetchResult>({
        type: "git.tags.fetch",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId
      });

      runInAction(() => {
        this.applyTagListResult(result);
      });

      if (result.warning !== null) {
        this.reportTagFetchWarning(result.warning);
      }

      if (this.selectedReferenceTagName !== null) {
        await this.loadCommitsSinceReferenceTag(this.selectedReferenceTagName);
      }
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isFetchingTags = false;
        this.hasLoadedTags = true;
      });
    }
  }

  /**
   * Creates a lightweight tag and selects it as reference.
   *
   * @param tagName Tag name.
   * @returns Whether creation succeeded.
   */
  async createTag(tagName: string): Promise<boolean> {
    const normalizedTagName = tagName.trim();

    if (!this.context.isAvailable || this.isCreatingTag || normalizedTagName.length === 0) {
      return false;
    }

    this.isCreatingTag = true;
    this.tagErrorMessage = null;

    try {
      const result = await this.context.request<OpenCodexGitTagListResult>({
        type: "git.tag.create",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId,
        tagName: normalizedTagName
      });

      runInAction(() => {
        this.applyTagListResult(result);
        this.selectedReferenceTagName = normalizedTagName;
      });
      const loaded = await this.loadCommitsSinceReferenceTag(normalizedTagName);

      if (loaded) {
        this.persistReferenceTagPreference(normalizedTagName);
      }

      return true;
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isCreatingTag = false;
      });
    }
  }

  /**
   * Pushes one local tag to the configured remote.
   *
   * @param tagName Tag name.
   * @param force Whether an existing remote tag may be replaced.
   * @returns Whether the push succeeded.
   */
  async pushTag(tagName: string, force = false): Promise<boolean> {
    const normalizedTagName = tagName.trim();

    if (
      !this.context.isAvailable ||
      !this.context.isRepository ||
      normalizedTagName.length === 0 ||
      this.pushingTagName !== null ||
      this.isPushingAllTags ||
      this.isFetchingTags ||
      this.isLoadingTags
    ) {
      return false;
    }

    this.pushingTagName = normalizedTagName;
    this.tagErrorMessage = null;

    try {
      const result = await this.context.request<OpenCodexGitTagListResult>({
        type: "git.tag.push",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId,
        tagName: normalizedTagName,
        force
      });

      runInAction(() => {
        this.applyTagListResult(result);
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.pushingTagName = null;
      });
    }
  }

  /**
   * Pushes all local tags to the configured remote without force.
   *
   * @returns Whether the push succeeded.
   */
  async pushTags(): Promise<boolean> {
    if (!this.canPushTags) {
      return false;
    }

    this.isPushingAllTags = true;
    this.tagErrorMessage = null;

    try {
      const result = await this.context.request<OpenCodexGitTagListResult>({
        type: "git.tags.push",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId
      });

      runInAction(() => {
        this.applyTagListResult(result);
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isPushingAllTags = false;
      });
    }
  }

  /**
   * Selects a tag used as release/reference point.
   *
   * @param tagName Tag name.
   * @returns Whether commit distance could be loaded.
   */
  async selectReferenceTag(tagName: string): Promise<boolean> {
    const normalizedTagName = tagName.trim();

    if (!this.context.isAvailable || normalizedTagName.length === 0) {
      return false;
    }

    runInAction(() => {
      this.selectedReferenceTagName = normalizedTagName;
      this.commitsSinceReferenceTag = null;
    });

    const loaded = await this.loadCommitsSinceReferenceTag(normalizedTagName);

    if (loaded) {
      this.persistReferenceTagPreference(normalizedTagName);
    }

    return loaded;
  }

  /** Clears tag state when the project is not a usable repository. */
  clearTags(): void {
    this.tags = [];
    this.tagsRemoteName = null;
    this.selectedReferenceTagName = null;
    this.commitsSinceReferenceTag = null;
    this.hasLoadedTags = true;
    this.tagErrorMessage = null;
    this.tagSyncErrorMessage = null;
  }

  /**
   * Loads commit distance from a reference tag to HEAD.
   *
   * @param tagName Reference tag name.
   * @returns Whether the count was loaded.
   */
  private async loadCommitsSinceReferenceTag(tagName: string): Promise<boolean> {
    this.isLoadingTagReference = true;
    this.tagErrorMessage = null;

    try {
      const count = await this.context.request<number>({
        type: "git.tag.commitsSince",
        projectPath: this.context.projectPath,
        sourceId: this.context.sourceId,
        tagName
      });

      runInAction(() => {
        this.commitsSinceReferenceTag = count;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isLoadingTagReference = false;
      });
    }
  }

  /**
   * Reloads local tags without fetching remotes.
   *
   * @returns Promise resolved when tags are loaded.
   */
  private async refreshLocalTags(): Promise<void> {
    const result = await this.context.request<OpenCodexGitTagListResult>({
      type: "git.tags",
      projectPath: this.context.projectPath,
      sourceId: this.context.sourceId
    });

    runInAction(() => {
      this.applyTagListResult(result);
    });

    if (this.selectedReferenceTagName !== null) {
      await this.loadCommitsSinceReferenceTag(this.selectedReferenceTagName);
    }
  }

  /**
   * Applies a tag listing and keeps the selected reference consistent.
   *
   * @param result Tag listing returned by the backend.
   */
  private applyTagListResult(result: OpenCodexGitTagListResult): void {
    this.tags = result.tags;
    this.tagsRemoteName = result.remoteName;
    this.tagSyncErrorMessage = result.remoteError;
    this.keepSelectedReferenceTag();
  }

  /**
   * Surfaces a non-fatal tag fetch warning to UI and logs.
   *
   * @param message Warning message.
   */
  private reportTagFetchWarning(message: string): void {
    this.context.reportWarning(message);
  }

  /** Clears the selected reference tag when it no longer exists locally. */
  private keepSelectedReferenceTag(): void {
    if (this.selectedReferenceTagName === null) {
      this.commitsSinceReferenceTag = null;
      return;
    }

    const stillExists = this.tags.some((tag) => tag.name === this.selectedReferenceTagName);

    if (!stillExists) {
      this.selectedReferenceTagName = null;
      this.commitsSinceReferenceTag = null;
      this.persistReferenceTagPreference(null);
    }
  }

  /** Persists the selected reference tag in project preferences. */
  private persistReferenceTagPreference(referenceTagName: string | null): void {
    const currentPreferences = cloneProjectPreferences(this.context.preferences);
    const preferences: OpenCodexProjectPreferences = {
      ...currentPreferences,
      git: {
        ...currentPreferences.git,
        referenceTagName
      }
    };

    void this.context.request<OpenCodexProject>({
      type: "projects.preferences.update",
      projectId: this.context.projectId,
      patch: preferences
    }).then((project) => {
      runInAction(() => {
        this.context.setProject(project);
      });
    }).catch((error) => {
      runInAction(() => {
        this.tagErrorMessage = readErrorMessage(error);
      });
    });
  }
}

/** Trims optional text and converts empty strings to `null`. */
function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
