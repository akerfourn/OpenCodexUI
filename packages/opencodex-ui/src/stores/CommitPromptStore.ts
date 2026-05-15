/**
 * Holds the editable prompt used for commit message generation.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexCommitPrompt,
  OpenCodexEvent
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "./RootChildStore";
import type { RootStore } from "./RootStore";

/**
 * Stores commit prompt content and persistence state.
 */
export class CommitPromptStore implements RootChildStore {
  prompt = "";
  savedPrompt = "";
  defaultPrompt = "";
  isDefault = true;
  isLoading = false;
  isSaving = false;
  errorMessage: string | null = null;

  constructor(private readonly root: RootStore) {
    makeAutoObservable<CommitPromptStore, "root">(
      this,
      { root: false },
      { autoBind: true }
    );
  }

  get isDirty(): boolean {
    return this.prompt !== this.defaultPrompt && this.prompt.trim().length > 0;
  }

  setPrompt(prompt: string): void {
    this.prompt = prompt;
  }

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

  private applyPrompt(prompt: OpenCodexCommitPrompt): void {
    this.prompt = prompt.prompt;
    this.savedPrompt = prompt.prompt;
    this.defaultPrompt = prompt.defaultPrompt;
    this.isDefault = prompt.isDefault;
  }
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
