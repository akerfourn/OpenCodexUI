/**
 * Holds the developer-only diagnostic trace for one selected Codex turn.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexTurnDiagnostic
} from "@open-codex-ui/opencodex-protocol";

import type { RootChildStore } from "../RootChildStore";
import type { RootStore } from "../RootStore";

/** Stores and loads one source-aware turn diagnostic. */
export class ChatTurnDiagnosticStore implements RootChildStore {
  /** Diagnostic currently displayed by the developer dialog. */
  diagnostic: OpenCodexTurnDiagnostic | null = null;
  /** Thread currently displayed by the dialog. */
  activeThreadId: string | null = null;
  /** Source currently displayed by the dialog. */
  activeSourceId: string | null = null;
  /** Turn currently displayed by the dialog. */
  activeTurnId: string | null = null;
  /** Whether the initial or manual read is in progress. */
  isLoading = false;
  /** Last read error, when any. */
  error: string | null = null;

  /** Creates the turn diagnostic store. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<ChatTurnDiagnosticStore, "root">(this, { root: false });
  }

  /** Applies a live diagnostic update for the selected turn. */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "thread.turnDiagnostic.updated" || !this.isActiveEvent(event)) {
      return;
    }

    this.diagnostic = event.diagnostic;
    this.isLoading = false;
    this.error = null;
  }

  /** Opens and loads a source-aware turn diagnostic. */
  open(threadId: string, sourceId: string | null, turnId: string): void {
    this.activeThreadId = threadId;
    this.activeSourceId = sourceId;
    this.activeTurnId = turnId;
    this.diagnostic = null;
    this.error = null;
    void this.load(threadId, sourceId, turnId);
  }

  /** Closes the currently selected diagnostic. */
  close(): void {
    this.activeThreadId = null;
    this.activeSourceId = null;
    this.activeTurnId = null;
    this.diagnostic = null;
    this.error = null;
    this.isLoading = false;
  }

  /** Reloads the currently selected diagnostic. */
  async refresh(): Promise<void> {
    if (
      this.activeThreadId === null ||
      this.activeTurnId === null
    ) {
      return;
    }

    await this.load(this.activeThreadId, this.activeSourceId, this.activeTurnId);
  }

  /** Reads one diagnostic while protecting the result from stale dialog loads. */
  private async load(
    threadId: string,
    sourceId: string | null,
    turnId: string
  ): Promise<void> {
    this.isLoading = true;

    try {
      const diagnostic = await this.root.request<OpenCodexTurnDiagnostic | null>({
        type: "threads.turnDiagnostic.read",
        threadId,
        sourceId,
        turnId
      });

      runInAction(() => {
        if (!this.isActiveSelection(threadId, sourceId, turnId)) {
          return;
        }

        this.diagnostic = diagnostic;
        this.isLoading = false;
        this.error = null;
      });
    } catch (error) {
      runInAction(() => {
        if (!this.isActiveSelection(threadId, sourceId, turnId)) {
          return;
        }

        this.isLoading = false;
        this.error = error instanceof Error ? error.message : String(error);
      });
    }
  }

  /** Checks whether a live event belongs to the selected diagnostic. */
  private isActiveEvent(
    event: Extract<OpenCodexEvent, { type: "thread.turnDiagnostic.updated" }>
  ): boolean {
    return this.isActiveSelection(
      event.threadId,
      event.sourceId ?? null,
      event.diagnostic.turnId ?? event.turnId ?? ""
    );
  }

  /** Checks whether a request result still belongs to the selected dialog. */
  private isActiveSelection(
    threadId: string,
    sourceId: string | null,
    turnId: string
  ): boolean {
    return this.activeThreadId === threadId &&
      this.activeSourceId === sourceId &&
      this.activeTurnId === turnId;
  }
}
