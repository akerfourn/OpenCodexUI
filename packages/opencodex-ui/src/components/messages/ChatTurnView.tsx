/**
 * Renders one chat turn and keeps turn-level observable reads local.
 */
import { useCallback, useMemo, type RefObject } from "react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import { EMPTY_COLLABORATION_EVENTS } from "../../stores/collaboration/CollaborationEventIndex";
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
  collaborationEvents?: readonly OpenCodexCollaborationEvent[];
  readCollaborationEventsForTurn?:
    (turnId: string) => readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onNavigateThread(threadId: string): void;
  onStartEdit(content: string): void;
  onOpenTurnDiagnostic(turnId: string): void;
  showTurnDiagnostic: boolean;
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
  readCollaborationEventsForTurn,
  currentThread,
  navigableThreadIds,
  lastMessageRef,
  onOpenLink,
  onNavigateThread,
  onStartEdit,
  onOpenTurnDiagnostic,
  showTurnDiagnostic
}: ChatTurnViewProps) {
  const { t } = useTranslation();
  const turn = turnStore.turn;
  const isRunning = turnStore.isRunning(activeTurnId, isWorking);
  const resolvedCollaborationEvents = collaborationEvents
    ?? readCollaborationEventsForTurn?.(turn.id)
    ?? EMPTY_COLLABORATION_EVENTS;
  const emptySubTurn = useMemo(() => createEmptySubTurn(turnStore.id), [turnStore.id]);
  const subTurns = readRenderableSubTurns(
    turnStore,
    isRunning,
    resolvedCollaborationEvents,
    emptySubTurn
  );
  const collaborationEventsBySubTurnId = useMemo(() => (
    assignCollaborationEvents(subTurns, resolvedCollaborationEvents)
  ), [resolvedCollaborationEvents, subTurns]);
  const errorMessage = turn.errorMessage ?? (
    turn.status === "failed" ? t("message.turnFailed") : null
  );
  const handleOpenTurnDiagnostic = useCallback(() => {
    onOpenTurnDiagnostic(turn.id);
  }, [onOpenTurnDiagnostic, turn.id]);

  return (
    <>
      {subTurns.map((subTurn, index) => (
        <ChatSubTurnViewX
          key={subTurn.id}
          turn={turn}
          subTurn={subTurn}
          collaborationEvents={collaborationEventsBySubTurnId.get(subTurn.id)
            ?? EMPTY_COLLABORATION_EVENTS}
          currentThread={currentThread}
          navigableThreadIds={navigableThreadIds}
          isReasoningRunning={isRunning && index === subTurns.length - 1}
          isLastInTurn={isLastTurn && index === subTurns.length - 1}
          editableItem={editableItem}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          onNavigateThread={onNavigateThread}
          onStartEdit={onStartEdit}
          onOpenTurnDiagnostic={onOpenTurnDiagnostic}
          showTurnDiagnostic={showTurnDiagnostic}
        />
      ))}
      {errorMessage !== null && errorMessage.trim().length > 0 ? (
        <TurnErrorRow
          message={errorMessage}
          showTurnDiagnostic={showTurnDiagnostic}
          onOpenTurnDiagnostic={handleOpenTurnDiagnostic}
        />
      ) : null}
    </>
  );
}

export const ChatTurnViewX = observer(ChatTurnView);

function readRenderableSubTurns(
  turnStore: ChatTurnStore,
  isRunning: boolean,
  collaborationEvents: readonly OpenCodexCollaborationEvent[],
  emptySubTurn: ChatSubTurn
): ChatSubTurn[] {
  const subTurns = turnStore.subTurns;

  if (subTurns.length > 0 || (!isRunning && collaborationEvents.length === 0)) {
    return subTurns;
  }

  return [emptySubTurn];
}

/** Creates the stable placeholder used while a running turn has no items yet. */
function createEmptySubTurn(turnId: string): ChatSubTurn {
  return {
    id: ["subTurn", turnId, "empty"].join(":"),
    userMessage: null,
    reasoningItems: [],
    assistantAnswer: null
  };
}
