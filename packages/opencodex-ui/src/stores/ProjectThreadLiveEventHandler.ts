import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import type { ProjectStore } from "./ProjectStore";

/** Runtime events that update an already loaded thread without a snapshot. */
export type ProjectThreadLiveEvent = Extract<
  OpenCodexEvent,
  {
    type:
      | "thread.tokenUsage.updated"
      | "message.started"
      | "message.delta"
      | "activity.updated"
      | "turn.started"
      | "turn.completed";
  }
>;

/** Store lookups required by the live thread event handler. */
export interface ProjectThreadLiveEventPorts {
  /** Finds a loaded chat using the event's source and thread identifiers. */
  findChatStoreByThreadId(threadId: string, sourceId?: string | null): ChatStore | null;
  /** Finds the owning project using the event's source and thread identifiers. */
  findProjectStoreForThread(threadId: string, sourceId?: string | null): ProjectStore | null;
}

/** Applies live thread events to the loaded chat and owning project. */
export class ProjectThreadLiveEventHandler {
  /**
   * Creates a stateless live event handler.
   *
   * @param ports Source-aware store lookups used by runtime events.
   */
  constructor(private readonly ports: ProjectThreadLiveEventPorts) {}

  /**
   * Applies one recognized live event synchronously.
   *
   * @param event Runtime event to apply.
   * @returns `true` when the event belongs to this handler.
   */
  handleEvent(event: ProjectThreadLiveEvent): boolean {
    switch (event.type) {
      case "thread.tokenUsage.updated": {
        const chatStore = this.ports.findChatStoreByThreadId(
          event.usage.threadId,
          event.sourceId
        );

        if (chatStore !== null) {
          chatStore.timeline.applyTokenUsage(event.usage);
        }

        return true;
      }
      case "message.started": {
        const chatStore = this.ports.findChatStoreByThreadId(event.threadId, event.sourceId);

        if (chatStore !== null) {
          chatStore.applyMessageStarted(event.message);
        }

        return true;
      }
      case "message.delta": {
        const chatStore = this.ports.findChatStoreByThreadId(event.threadId, event.sourceId);

        if (chatStore !== null) {
          chatStore.timeline.appendAssistantDelta(
            event.turnId,
            event.messageId,
            event.delta,
            event.phase ?? null
          );
        }

        return true;
      }
      case "activity.updated": {
        const chatStore = this.ports.findChatStoreByThreadId(event.threadId, event.sourceId);

        if (chatStore !== null) {
          chatStore.timeline.applyActivityUpdated(
            event.activity,
            chatStore.runtime.activeTurnId,
            chatStore.runtime.pendingTurnId
          );
        }

        return true;
      }
      case "turn.started": {
        const chatStore = this.ports.findChatStoreByThreadId(event.threadId, event.sourceId);

        if (chatStore !== null) {
          chatStore.applyTurnStarted(event.turnId);
        }

        return true;
      }
      case "turn.completed": {
        const chatStore = this.ports.findChatStoreByThreadId(event.threadId, event.sourceId);

        if (chatStore === null) {
          return true;
        }

        const shouldRefreshGit = chatStore.runtime.activeTurnId === event.turnId;

        chatStore.applyTurnCompleted(
          event.turnId,
          event.durationMs,
          event.turnStatus,
          event.errorMessage
        );

        if (shouldRefreshGit) {
          const projectStore = this.ports.findProjectStoreForThread(
            event.threadId,
            event.sourceId
          );
          void projectStore?.gitStore.statusStore.refresh();
        }

        return true;
      }
      default:
        return false;
    }
  }
}
