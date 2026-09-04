import { useCallback, type RefObject } from "react";
import { observer } from "mobx-react-lite";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";
import type { ChatSubTurn } from "../../stores/chat/chatTurnStructure";

import { AssistantTurnBlockX } from "./AssistantTurnBlock";
import { MessageRowX } from "./MessageRow";

type EditableItemIdentity = {
  turnId: string;
  itemId: string;
};

type ChatSubTurnViewProps = {
  turn: OpenCodexTurn;
  subTurn: ChatSubTurn;
  collaborationEvents: readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  isReasoningRunning: boolean;
  isLastInTurn: boolean;
  editableItem: EditableItemIdentity | null;
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onNavigateThread(threadId: string): void;
  onStartEdit(content: string): void;
  onOpenTurnDiagnostic(turnId: string): void;
  showTurnDiagnostic: boolean;
};

/**
 * Renders one user-guidance segment and its associated reasoning block.
 *
 * @param props Component props.
 *
 * @returns Rendered sub-turn rows.
 */
export function ChatSubTurnView({
  turn,
  subTurn,
  collaborationEvents,
  currentThread,
  navigableThreadIds,
  isReasoningRunning,
  isLastInTurn,
  editableItem,
  lastMessageRef,
  onOpenLink,
  onNavigateThread,
  onStartEdit,
  onOpenTurnDiagnostic,
  showTurnDiagnostic
}: ChatSubTurnViewProps) {
  const assistantAnswer = subTurn.assistantAnswer;
  const shouldShowReasoning = subTurn.reasoningItems.length > 0
    || collaborationEvents.length > 0
    || isReasoningRunning;
  const shouldShowAnswer = assistantAnswer !== null;
  const isUserMessageLast = isLastInTurn && !shouldShowReasoning && !shouldShowAnswer;
  const isReasoningLast = isLastInTurn && shouldShowReasoning && !shouldShowAnswer;
  const isAnswerLast = isLastInTurn && shouldShowAnswer;
  const canEdit = isEditableUserMessage(turn.id, subTurn.userMessage?.id ?? null, editableItem);
  const handleEdit = useCallback(() => {
    if (subTurn.userMessage !== null) {
      onStartEdit(subTurn.userMessage.content);
    }
  }, [onStartEdit, subTurn.userMessage]);
  const handleOpenTurnDiagnostic = useCallback(() => {
    onOpenTurnDiagnostic(turn.id);
  }, [onOpenTurnDiagnostic, turn.id]);

  return (
    <>
      {subTurn.userMessage !== null ? (
        <MessageRowX
          key={buildSubTurnItemKey(turn.id, subTurn.userMessage.id)}
          item={subTurn.userMessage}
          fallbackCreatedAt={turn.startedAt}
          isLast={isUserMessageLast}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          canEdit={canEdit}
          onEdit={canEdit ? handleEdit : undefined}
        />
      ) : null}
      {shouldShowReasoning ? (
        <AssistantTurnBlockX
          key={buildSubTurnReasoningKey(turn.id, subTurn.id)}
          turn={turn}
          preludeItems={subTurn.reasoningItems}
          collaborationEvents={collaborationEvents}
          currentThread={currentThread}
          navigableThreadIds={navigableThreadIds}
          isRunning={isReasoningRunning}
          lastMessageRef={lastMessageRef}
          isLast={isReasoningLast}
          onOpenLink={onOpenLink}
          onNavigateThread={onNavigateThread}
        />
      ) : null}
      {assistantAnswer !== null ? (
        <MessageRowX
          key={buildSubTurnItemKey(turn.id, assistantAnswer.id)}
          item={assistantAnswer}
          fallbackCreatedAt={turn.completedAt ?? turn.startedAt}
          isLast={isAnswerLast}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          isRunning={isReasoningRunning}
          turnExecution={turn.execution}
          turnTokenUsage={turn.tokenUsage}
          turnId={turn.id}
          showTurnDiagnostic={showTurnDiagnostic}
          onOpenTurnDiagnostic={handleOpenTurnDiagnostic}
        />
      ) : null}
    </>
  );
}

export const ChatSubTurnViewX = observer(ChatSubTurnView);

function isEditableUserMessage(
  turnId: string,
  itemId: string | null,
  editableItem: EditableItemIdentity | null
): boolean {
  if (itemId === null || editableItem === null) {
    return false;
  }

  return editableItem.turnId === turnId && editableItem.itemId === itemId;
}

function buildSubTurnItemKey(turnId: string, itemId: string): string {
  return ["subTurnItem", turnId, itemId].join(":");
}

function buildSubTurnReasoningKey(turnId: string, subTurnId: string): string {
  return ["subTurnReasoning", turnId, subTurnId].join(":");
}
