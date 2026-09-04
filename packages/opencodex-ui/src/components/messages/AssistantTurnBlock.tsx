/** Renders one assistant reasoning block and its persistent active plan. */
import { observer } from "mobx-react-lite";
import { type RefObject } from "react";
import { Box } from "@mui/material";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import { PersistentPlanSectionX } from "./PersistentPlanSection";
import { ReasoningTimelineX } from "./ReasoningTimeline";

type AssistantTurnBlockProps = {
  turn: OpenCodexTurn;
  preludeItems: OpenCodexTurnItem[];
  collaborationEvents: readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  isRunning: boolean;
  lastMessageRef: RefObject<HTMLElement>;
  isLast: boolean;
  onOpenLink(href: string): void;
  onNavigateThread(threadId: string): void;
};

/**
 * Renders the assistant turn block.
 *
 * The elapsed-time state lives in ReasoningBlockTitle, while individual rows,
 * collaboration cards, and the persistent plan observe their own data.
 */
export function AssistantTurnBlock({
  turn,
  preludeItems,
  collaborationEvents,
  currentThread,
  navigableThreadIds,
  isRunning,
  lastMessageRef,
  isLast,
  onOpenLink,
  onNavigateThread
}: AssistantTurnBlockProps) {
  const blockRef = isLast ? lastMessageRef : undefined;

  return (
    <Box
      ref={blockRef}
      component="article"
      sx={{
        display: "block",
        flex: "0 0 auto",
        minWidth: 0,
        minHeight: 36,
        width: "100%",
        maxWidth: "100%",
        overflow: "visible"
      }}
    >
      <ReasoningTimelineX
        turn={turn}
        preludeItems={preludeItems}
        collaborationEvents={collaborationEvents}
        currentThread={currentThread}
        navigableThreadIds={navigableThreadIds}
        isRunning={isRunning}
        lastMessageRef={lastMessageRef}
        onOpenLink={onOpenLink}
        onNavigateThread={onNavigateThread}
      />
      <PersistentPlanSectionX
        preludeItems={preludeItems}
        isRunning={isRunning}
      />
    </Box>
  );
}

export const AssistantTurnBlockX = observer(AssistantTurnBlock);
