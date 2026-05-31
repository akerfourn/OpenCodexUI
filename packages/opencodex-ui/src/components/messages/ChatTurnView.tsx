/**
 * Renders one chat turn and keeps turn-level observable reads local.
 */
import { useLayoutEffect, type RefObject } from "react";
import { observer } from "mobx-react-lite";

import type { OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";
import type { ChatTurnStore } from "../../stores/ChatTurnStore";
import type { ChatSubTurn } from "../../stores/chatTurnStructure";

import { ChatSubTurnViewX } from "./ChatSubTurnView";
import { MessageRowM } from "./MessageRow";

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
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onStartEdit(content: string): void;
  onContentLayoutChange(): void;
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
  lastMessageRef,
  onOpenLink,
  onStartEdit,
  onContentLayoutChange
}: ChatTurnViewProps) {
  const turn = turnStore.turn;
  const isRunning = turnStore.isRunning(activeTurnId, isWorking);
  const subTurns = readRenderableSubTurns(turnStore, isRunning);
  const finalAnswer = turnStore.finalAnswer;

  useLayoutEffect(() => {
    if (!isLastTurn) {
      return;
    }

    onContentLayoutChange();
  });

  return (
    <>
      {subTurns.map((subTurn, index) => (
        <ChatSubTurnViewX
          key={subTurn.id}
          turn={turn}
          subTurn={subTurn}
          isReasoningRunning={isRunning && index === subTurns.length - 1}
          isLastInTurn={isLastTurn && finalAnswer === null && index === subTurns.length - 1}
          editableItem={editableItem}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          onStartEdit={onStartEdit}
        />
      ))}
      {finalAnswer !== null ? (
        <MessageRowM
          key={buildFinalAnswerKey(turnStore.id, finalAnswer)}
          isLast={isLastTurn}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
          role={finalAnswer.role}
          phase={finalAnswer.phase}
          kind={finalAnswer.kind}
          content={finalAnswer.content}
          createdAt={finalAnswer.createdAt ?? turn.completedAt ?? turn.startedAt}
          details={finalAnswer.details}
          attachments={finalAnswer.attachments ?? []}
        />
      ) : null}
    </>
  );
}

export const ChatTurnViewX = observer(ChatTurnView);

function readRenderableSubTurns(turnStore: ChatTurnStore, isRunning: boolean): ChatSubTurn[] {
  if (turnStore.subTurns.length > 0 || !isRunning) {
    return turnStore.subTurns;
  }

  return [
    {
      id: ["subTurn", turnStore.id, "running-empty"].join(":"),
      userMessage: null,
      reasoningItems: []
    }
  ];
}

function buildFinalAnswerKey(turnId: string, item: OpenCodexTurnItem): string {
  return ["turnFinalAnswer", turnId, item.id].join(":");
}
