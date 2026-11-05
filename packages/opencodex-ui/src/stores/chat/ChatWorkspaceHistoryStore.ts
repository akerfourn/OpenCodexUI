import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexWorkspaceTransitionEvent } from "@open-codex-ui/opencodex-protocol";
import type { ChatStore } from "./ChatStore";
import type { RootStore } from "../RootStore";

/** Confirmed selection history is loaded on demand and never reconstructed from turn paths. */
export class ChatWorkspaceHistoryStore {
  /** Immutable source/path snapshots returned by the cache. */
  events: OpenCodexWorkspaceTransitionEvent[] = [];
  /** Failures remain separate from the message content. */
  error: string | null = null;
  /** Metadata changes refresh only histories already displayed. */
  private loaded = false;
  /** Discards late responses and replies after chat disposal. */
  private generation = 0;

  /** Retains UI references locally; requests contain only the captured thread identity. */
  constructor(private readonly chat: ChatStore, private readonly root: RootStore) {
    makeAutoObservable<ChatWorkspaceHistoryStore, "chat" | "root">(
      this, { chat: false, root: false }, { autoBind: true }
    );
  }

  /** Reads local confirmed events, including when the source is offline. */
  async load(): Promise<void> {
    if (this.chat.isLocalDraft) return;
    const generation = ++this.generation;
    const threadId = this.chat.thread.id;
    const sourceId = this.chat.sourceId;
    this.loaded = true;
    this.error = null;
    try {
      const events = await this.root.request<OpenCodexWorkspaceTransitionEvent[]>({
        type: "threads.workspace.history", threadId
      });
      runInAction(() => {
        if (generation !== this.generation || threadId !== this.chat.thread.id || sourceId !== this.chat.sourceId) return;
        this.events = events.filter(event => event.threadId === threadId
          && (sourceId === null || event.sourceId === sourceId));
      });
    } catch (error) {
      runInAction(() => {
        if (generation === this.generation) this.error = String(error);
      });
    }
  }

  /** A verified metadata update may reveal a newly committed transition. */
  refreshIfLoaded(): void {
    if (this.loaded) void this.load();
  }

  /** Prevents an old request from repopulating a closed chat. */
  dispose(): void {
    this.generation += 1;
  }
}
