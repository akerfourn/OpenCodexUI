import { memo, type RefObject } from "react";

import type {
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { MessageRowX } from "./MessageRow";
import { CollaborationEventCardM } from "./CollaborationEventCard";
import type { ReasoningTimelineEntry as TimelineEntry } from "./collaborationReasoningTimeline";

type ReasoningTimelineEntryProps = {
  entry: TimelineEntry;
  turn: OpenCodexTurn;
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  isRunning: boolean;
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onNavigateThread(threadId: string): void;
};

/** Renders one memoized entry of the reasoning timeline. */
export function ReasoningTimelineEntry({
  entry,
  turn,
  currentThread,
  navigableThreadIds,
  isRunning,
  lastMessageRef,
  onOpenLink,
  onNavigateThread
}: ReasoningTimelineEntryProps) {
  if (entry.type === "collaboration") {
    return (
      <CollaborationEventCardM
        event={entry.event}
        currentThread={currentThread}
        displayMode="embedded"
        navigableThreadIds={navigableThreadIds}
        onNavigateThread={onNavigateThread}
      />
    );
  }

  return (
    <MessageRowX
      item={entry.item}
      fallbackCreatedAt={turn.startedAt}
      isLast={false}
      lastMessageRef={lastMessageRef}
      onOpenLink={onOpenLink}
      isRunning={isRunning}
      widthMode="container"
    />
  );
}

export const ReasoningTimelineEntryM = memo(ReasoningTimelineEntry);
