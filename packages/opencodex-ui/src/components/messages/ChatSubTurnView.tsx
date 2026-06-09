import { type RefObject } from "react";
import { observer } from "mobx-react-lite";

import type { OpenCodexTurn } from "@open-codex-ui/opencodex-protocol";
import type { ChatSubTurn } from "../../stores/chatTurnStructure";

import { AssistantTurnBlockX } from "./AssistantTurnBlock";
import { MessageRowM } from "./MessageRow";

type EditableItemIdentity = {
  turnId: string;
  itemId: string;
};

type ChatSubTurnViewProps = {
  turn: OpenCodexTurn;
  subTurn: ChatSubTurn;
  isReasoningRunning: boolean;
  isLastInTurn: boolean;
  editableItem: EditableItemIdentity | null;
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onStartEdit(content: string): void;
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
  isReasoningRunning,
  isLastInTurn,
  editableItem,
  lastMessageRef,
  onOpenLink,
  onStartEdit
}: ChatSubTurnViewProps) {
  const assistantAnswer = subTurn.assistantAnswer;
  const shouldShowReasoning = subTurn.reasoningItems.length > 0 || isReasoningRunning;
  const shouldShowAnswer = assistantAnswer !== null;
  const isUserMessageLast = isLastInTurn && !shouldShowReasoning && !shouldShowAnswer;
  const isReasoningLast = isLastInTurn && shouldShowReasoning && !shouldShowAnswer;
  const isAnswerLast = isLastInTurn && shouldShowAnswer;
  const canEdit = isEditableUserMessage(turn.id, subTurn.userMessage?.id ?? null, editableItem);

  return (
    <>
      {subTurn.userMessage !== null ? (
        <MessageRowM
          key={buildSubTurnItemKey(turn.id, subTurn.userMessage.id)}
          isLast={isUserMessageLast}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          role={subTurn.userMessage.role}
          phase={subTurn.userMessage.phase}
          kind={subTurn.userMessage.kind}
          content={subTurn.userMessage.content}
          createdAt={subTurn.userMessage.createdAt ?? turn.startedAt}
          details={subTurn.userMessage.details}
          attachments={subTurn.userMessage.attachments ?? []}
          canEdit={canEdit}
          onEdit={canEdit ? () => onStartEdit(subTurn.userMessage?.content ?? "") : undefined}
        />
      ) : null}
      {shouldShowReasoning ? (
        <AssistantTurnBlockX
          key={buildSubTurnReasoningKey(turn.id, subTurn.id)}
          turn={turn}
          preludeItems={subTurn.reasoningItems}
          isRunning={isReasoningRunning}
          lastMessageRef={lastMessageRef}
          isLast={isReasoningLast}
          onOpenLink={onOpenLink}
        />
      ) : null}
      {assistantAnswer !== null ? (
        <MessageRowM
          key={buildSubTurnItemKey(turn.id, assistantAnswer.id)}
          isLast={isAnswerLast}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          role={assistantAnswer.role}
          phase={assistantAnswer.phase}
          kind={assistantAnswer.kind}
          content={assistantAnswer.content}
          createdAt={assistantAnswer.createdAt ?? turn.completedAt ?? turn.startedAt}
          details={assistantAnswer.details}
          attachments={assistantAnswer.attachments ?? []}
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
