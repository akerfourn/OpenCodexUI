/**
 * Renders one chat turn and keeps turn-level observable reads local.
 */
import type { RefObject } from "react";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ChatTurnStore } from "../../stores/ChatTurnStore";
import type { ChatSubTurn } from "../../stores/chatTurnStructure";

import { ChatSubTurnViewX } from "./ChatSubTurnView";
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
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
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
  lastMessageRef,
  onOpenLink,
  onStartEdit
}: ChatTurnViewProps) {
  const { t } = useTranslation();
  const turn = turnStore.turn;
  const isRunning = turnStore.isRunning(activeTurnId, isWorking);
  const subTurns = readRenderableSubTurns(turnStore, isRunning);
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
          isReasoningRunning={isRunning && index === subTurns.length - 1}
          isLastInTurn={isLastTurn && index === subTurns.length - 1}
          editableItem={editableItem}
          lastMessageRef={lastMessageRef}
          onOpenLink={onOpenLink}
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

function readRenderableSubTurns(turnStore: ChatTurnStore, isRunning: boolean): ChatSubTurn[] {
  if (turnStore.subTurns.length > 0 || !isRunning) {
    return turnStore.subTurns;
  }

  return [
    {
      id: ["subTurn", turnStore.id, "running-empty"].join(":"),
      userMessage: null,
      reasoningItems: [],
      assistantAnswer: null
    }
  ];
}
