import { observer } from "mobx-react-lite";

import type {
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import type { CollaborationStore } from "../../stores/collaboration/CollaborationStore";
import { CollaborationEventListM } from "./CollaborationEventList";

type CollaborationThreadContextProps = {
  collaborationStore: CollaborationStore;
  sourceId: string | null;
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  onNavigateThread(threadId: string): void;
};

/** Renders context collaboration events without subscribing the message list to them. */
export function CollaborationThreadContext({
  collaborationStore,
  sourceId,
  currentThread,
  navigableThreadIds,
  onNavigateThread
}: CollaborationThreadContextProps) {
  if (sourceId === null) {
    return null;
  }

  const events = collaborationStore.readThreadContextEvents(sourceId, currentThread.id);

  return (
    <CollaborationEventListM
      events={events}
      currentThread={currentThread}
      isThreadContext
      navigableThreadIds={navigableThreadIds}
      onNavigateThread={onNavigateThread}
    />
  );
}

export const CollaborationThreadContextX = observer(CollaborationThreadContext);
