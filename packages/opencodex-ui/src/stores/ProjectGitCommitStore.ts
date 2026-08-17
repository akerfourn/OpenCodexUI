/**
 * Holds the Git commit message editor and commit actions for one project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexGitCommitResult,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import { readErrorMessage } from "./gitErrorMessage";
import type { ProjectGitStore } from "./ProjectGitStore";

/**
 * Stores the editable commit message and commit-related Git actions.
 */
export class ProjectGitCommitStore {
  /** Commit message currently edited in the Git panel. */
  commitMessage = "";
  /** Whether a commit operation is in flight. */
  isCommitting = false;
  /** Whether the commit message generator is running. */
  isGeneratingCommitMessage = false;

  /**
   * Creates a commit store attached to its owning Git aggregate.
   *
   * @param parent Owning Git store used for project context and coordination.
   */
  constructor(private readonly parent: ProjectGitStore) {
    makeAutoObservable<ProjectGitCommitStore, "parent">(
      this,
      {
        parent: false
      },
      {
        autoBind: true
      }
    );
  }

  /** Whether the current staged state and message can be committed. */
  get canCommit(): boolean {
    return (
      this.parent.changesStore.stagedFilesCount > 0 &&
      this.commitMessage.trim().length > 0 &&
      !this.isCommitting &&
      !this.isGeneratingCommitMessage &&
      !this.parent.changesStore.isBusy
    );
  }

  /** Whether a commit message can be generated for staged files. */
  get canGenerateCommitMessage(): boolean {
    return (
      this.parent.changesStore.stagedFilesCount > 0 &&
      !this.parent.changesStore.isBusy &&
      !this.isGeneratingCommitMessage &&
      this.parent.isAvailable
    );
  }

  /** Model configured for commit message generation. */
  get commitGenerationModelLabel(): string | null {
    return this.parent.settingsStore.settings.commitMessageModel;
  }

  /** Reasoning effort configured for commit message generation. */
  get commitGenerationReasoningEffortLabel(): string | null {
    return this.parent.settingsStore.settings.commitMessageReasoningEffort;
  }

  /**
   * Updates the editable commit message unless generation is in progress.
   *
   * @param value Commit message text.
   */
  setCommitMessage(value: string): void {
    if (this.isGeneratingCommitMessage) {
      return;
    }

    this.commitMessage = value;
  }

  /**
   * Creates a Git commit with the current staged files and message.
   *
   * @returns Promise resolved when commit completes.
   */
  async commit(): Promise<void> {
    if (!this.canCommit) {
      return;
    }

    this.isCommitting = true;
    this.parent.errorMessage = null;

    try {
      await this.parent.request<OpenCodexGitCommitResult>({
        type: "git.commit",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId,
        message: this.commitMessage
      });

      runInAction(() => {
        this.commitMessage = "";
      });
      await this.parent.statusStore.refresh();
    } catch (error) {
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isCommitting = false;
      });
    }
  }

  /**
   * Generates a commit message from staged changes.
   *
   * @param instruction Optional user instruction.
   * @returns Promise resolved when generation completes.
   */
  async generateCommitMessage(instruction: string): Promise<void> {
    if (!this.canGenerateCommitMessage) {
      return;
    }

    this.isGeneratingCommitMessage = true;
    this.parent.errorMessage = null;

    try {
      const result = await this.parent.request<OpenCodexCommitMessageGenerationResult>({
        type: "git.commitMessage.generate",
        projectPath: this.parent.projectPath,
        sourceId: this.parent.sourceId,
        instruction,
        model: this.parent.settingsStore.settings.commitMessageModel,
        reasoningEffort: this.parent.settingsStore.settings.commitMessageReasoningEffort,
        language: this.parent.settingsStore.settings.commitMessageLanguage
      });

      runInAction(() => {
        this.commitMessage = result.message;
      });
    } catch (error) {
      runInAction(() => {
        this.parent.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isGeneratingCommitMessage = false;
      });
    }
  }

  /**
   * Applies a pending commit message without replacing an edited message.
   *
   * @param status Git status snapshot.
   */
  reconcileStatus(status: OpenCodexGitStatus): void {
    if (this.commitMessage.trim().length === 0 && status.pendingCommitMessage !== null) {
      this.commitMessage = status.pendingCommitMessage;
    }
  }
}
