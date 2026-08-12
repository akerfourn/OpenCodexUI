import { makeAutoObservable } from "mobx";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "./RootStore";
import { SubAgentThreadRegistry } from "./SubAgentThreadRegistry";

/**
 * Stores source-aware sub-agent discovery and readonly timeline data.
 */
export class SubAgentThreadStore {
  /** Source-aware sub-agent metadata and root membership registry. */
  private readonly registry = new SubAgentThreadRegistry();

  /**
   * Creates the sub-agent thread store.
   *
   * @param root Root store used for backend and collaboration access.
   */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<SubAgentThreadStore, "root" | "registry">(this, {
      root: false,
      registry: false
    });
  }

  /**
   * Lists readonly sub-agent threads spawned from a parent thread.
   *
   * @param parentThreadId Parent thread identifier.
   * @param sourceId Source that owns the parent thread.
   * @returns Sub-agent thread metadata.
   */
  async list(parentThreadId: string, sourceId: string | null): Promise<OpenCodexThread[]> {
    const threads = await this.root.request<OpenCodexThread[]>({
      type: "threads.subAgents.list",
      sourceId,
      parentThreadId
    });

    return this.registry.replaceRoot(sourceId, parentThreadId, threads);
  }

  /**
   * Reads the loaded descendants for one source-aware root.
   *
   * @param parentThreadId Parent thread identifier.
   * @param sourceId Source that owns the parent thread.
   * @returns Loaded descendants, or an empty list.
   */
  read(parentThreadId: string, sourceId: string | null): OpenCodexThread[] {
    return this.registry.readRoot(sourceId, parentThreadId);
  }

  /**
   * Loads collaboration events required by a readonly timeline.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread used as the hierarchy root.
   * @returns Persisted normalized collaboration events.
   */
  async loadCollaborationEvents(
    sourceId: string,
    threadId: string
  ): Promise<OpenCodexCollaborationEvent[]> {
    return await this.root.collaborationStore.loadThreadEvents(sourceId, threadId);
  }

  /**
   * Reads collaboration events currently known for a readonly thread.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread identifier.
   * @returns Matching normalized events.
   */
  readCollaborationEvents(
    sourceId: string,
    threadId: string
  ): OpenCodexCollaborationEvent[] {
    return this.root.collaborationStore.readThreadEvents(sourceId, threadId);
  }

  /** Adds a newly announced sub-agent to every compatible ancestor list. */
  recordThread(thread: OpenCodexThread): void {
    this.registry.upsert(thread);
  }

  /** Applies runtime agent statuses carried by collaboration events. */
  updateStatuses(sourceId: string, statuses: Readonly<Record<string, string>>): void {
    this.registry.updateStatuses(sourceId, statuses);
  }

  /**
   * Reads a secondary thread without changing the selected chat.
   *
   * @param threadId Thread identifier.
   * @param sourceId Source that owns the thread.
   * @returns Thread metadata and turns.
   */
  async readThread(
    threadId: string,
    sourceId: string | null
  ): Promise<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }> {
    return await this.root.request<{ thread: OpenCodexThread; turns: OpenCodexTurn[] }>({
      type: "threads.readReadonly",
      threadId,
      sourceId
    });
  }

  /** Clears every loaded sub-agent hierarchy and runtime status. */
  clear(): void {
    this.registry.clear();
  }
}
