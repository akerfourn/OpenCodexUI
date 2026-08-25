/**
 * Renders one chat turn and keeps turn-level observable reads local.
 */
import type { RefObject } from "react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import type { ChatTurnStore } from "../../stores/chat/ChatTurnStore";
import type { ChatSubTurn } from "../../stores/chat/chatTurnStructure";

import { ChatSubTurnViewX } from "./ChatSubTurnView";
import { assignCollaborationEvents } from "./collaborationReasoningTimeline";
import { TurnErrorRow } from "./TurnErrorRow";

type EditableItemIdentity = {
  turnId: string;
  itemId: string;
};

type ChatTurnViewProps = {
  turnStore: ChatTurnStore;
  activeTurnId: string | null;
  isWorking: boolean;
  isLastTurn: boolean;
  editableItem: EditableItemIdentity | null;
  collaborationEvents: readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onNavigateThread(threadId: string): void;
  onStartEdit(content: string): void;
};

/**
 * Renders one chat turn.
 *
 * @param props Component props.
 *
 * @returns Rendered turn rows.
 */
export function ChatTurnView({
  turnStore,
  activeTurnId,
  isWorking,
  isLastTurn,
  editableItem,
  collaborationEvents,
  currentThread,
  navigableThreadIds,
  lastMessageRef,
  onOpenLink,
  onNavigateThread,
  onStartEdit
}: ChatTurnViewProps) {
  const { t } = useTranslation();
  const turn = turnStore.turn;
  const isRunning = turnStore.isRunning(activeTurnId, isWorking);
  const subTurns = readRenderableSubTurns(turnStore, isRunning, collaborationEvents);
  const collaborationEventsBySubTurnId = assignCollaborationEvents(
    subTurns,
    collaborationEvents
  );
  const errorMessage = turn.errorMessage ?? (
    turn.status === "failed" ? t("message.turnFailed") : null
  );

  return (
    <>
      {subTurns.map((subTurn, index) => (
        <ChatSubTurnViewX
          key={subTurn.id}
          turn={turn}
          subTurn={subTurn}
          collaborationEvents={collaborationEventsBySubTurnId.get(subTurn.id) ?? []}
          currentThread={currentThread}
          navigableThreadIds={navigableThreadIds}
          isReasoningRunning={isRunning && index === subTurns.length - 1}
          isLastInTurn={isLastTurn && index === subTurns.length - 1}
          editableItem={editableItem}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          onNavigateThread={onNavigateThread}
          onStartEdit={onStartEdit}
        />
      ))}
      {errorMessage !== null && errorMessage.trim().length > 0 ? (
        <TurnErrorRow message={errorMessage} />
      ) : null}
    </>
  );
}

export const ChatTurnViewX = observer(ChatTurnView);

function readRenderableSubTurns(
  turnStore: ChatTurnStore,
  isRunning: boolean,
  collaborationEvents: readonly OpenCodexCollaborationEvent[]
): ChatSubTurn[] {
  const subTurns = turnStore.subTurns;

  if (subTurns.length > 0 || (!isRunning && collaborationEvents.length === 0)) {
    return [...subTurns];
  }

  return [
    {
      id: ["subTurn", turnStore.id, "empty"].join(":"),
      userMessage: null,
      reasoningItems: [],
      assistantAnswer: null
    }
  ];
}
