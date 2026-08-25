/**
 * Holds the editable prompt used for commit message generation.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexCommitPrompt,
  OpenCodexEvent
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "../RootChildStore";
import type { RootStore } from "../RootStore";

/**
 * Stores commit prompt content and persistence state.
 */
export class CommitPromptStore implements RootChildStore {
  /** Editable prompt currently shown in the settings UI. */
  prompt = "";
  /** Last prompt value persisted by the backend. */
  savedPrompt = "";
  /** Built-in prompt used when no user prompt is configured. */
  defaultPrompt = "";
  /** Whether the persisted prompt matches the built-in default. */
  isDefault = true;
  /** Whether the prompt is being loaded. */
  isLoading = false;
  /** Whether a save or reset request is in flight. */
  isSaving = false;
  /** Last prompt persistence error shown by the UI. */
  errorMessage: string | null = null;

  /**
   * Creates the commit prompt store.
   *
   * @param root Root store used for backend requests.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<CommitPromptStore, "root">(
      this,
      { root: false },
      { autoBind: true }
    );
  }

  /** Whether the current prompt differs from the built-in default. */
  get isDirty(): boolean {
    return this.prompt !== this.defaultPrompt && this.prompt.trim().length > 0;
  }

  /**
   * Updates the editable prompt value.
   *
   * @param prompt New prompt text.
   */
  setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

  /**
   * Restores the prompt currently persisted by the backend.
   */
  restoreSavedPrompt(): void {
    this.prompt = this.savedPrompt;
  }

  /**
   * This store has no event-driven state today.
   *
   * @param event Backend event.
   * @returns Nothing.
   */
  handleEvent(_event: OpenCodexEvent): void {
    return;
  }

  /**
   * Loads the commit prompt configuration.
   *
   * @returns Promise resolved when loading completes.
   */
  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const prompt = await this.root.request<OpenCodexCommitPrompt>({ type: "commitPrompt.get" });
      runInAction(() => {
        this.applyPrompt(prompt);
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Persists the current prompt value.
   *
   * @returns Promise resolved when saving completes.
   */
  async save(): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const prompt = await this.root.request<OpenCodexCommitPrompt>({
        type: "commitPrompt.update",
        prompt: this.prompt
      });
      runInAction(() => {
        this.applyPrompt(prompt);
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Resets the user prompt to the built-in default.
   *
   * @returns Promise resolved when reset completes.
   */
  async reset(): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const prompt = await this.root.request<OpenCodexCommitPrompt>({ type: "commitPrompt.reset" });
      runInAction(() => {
        this.applyPrompt(prompt);
      });
    } catch (error) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Applies prompt data returned by the backend.
   *
   * @param prompt Prompt DTO.
   */
  private applyPrompt(prompt: OpenCodexCommitPrompt): void {
    this.prompt = prompt.prompt;
    this.savedPrompt = prompt.prompt;
    this.defaultPrompt = prompt.defaultPrompt;
    this.isDefault = prompt.isDefault;
  }
}

/**
 * Converts unknown errors into displayable prompt error text.
 *
 * @param error Unknown caught error.
 * @returns Error message.
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
