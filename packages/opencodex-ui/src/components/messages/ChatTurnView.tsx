/**
 * Renders one chat turn and keeps turn-level observable reads local.
 */
import { useLayoutEffect, type RefObject } from "react";
import { observer } from "mobx-react-lite";

import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

import { AssistantTurnBlockX } from "./AssistantTurnBlock";
import { MessageRowM } from "./MessageRow";
import { isPreludeItem } from "./turnItemFilters";

type EditableItemIdentity = {
  turnId: string;
  itemId: string;
};

type ChatTurnViewProps = {
  turn: OpenCodexTurn;
  activeTurnId: string | null;
  isWorking: boolean;
  isLastTurn: boolean;
  editableItem: EditableItemIdentity | null;
  lastMessageRef: RefObject<HTMLElement>;
  /**
   * Handles external link opening.
   *
   * @param href Link target.
   *
   * @returns Nothing.
   */
  onOpenLink(href: string): void;
  /**
   * Starts editing a user message.
   *
   * @param content Message content.
   *
   * @returns Nothing.
   */
  onStartEdit(content: string): void;
  /**
   * Reports that the rendered turn content may have changed height.
   *
   * @returns Nothing.
   */
  onContentLayoutChange(): void;
};

type TimelineEntry =
  | { type: "item"; key: string; turn: OpenCodexTurn; item: OpenCodexTurnItem }
  | {
      type: "turnPrelude";
      key: string;
      turn: OpenCodexTurn;
      items: OpenCodexTurnItem[];
      isRunning: boolean;
    };

/**
 * Renders one chat turn.
 *
 * @param props Component props.
 *
 * @returns Rendered turn rows.
 */
export function ChatTurnView({
  turn,
  activeTurnId,
  isWorking,
  isLastTurn,
  editableItem,
  lastMessageRef,
  onOpenLink,
  onStartEdit,
  onContentLayoutChange
}: ChatTurnViewProps) {
  const entries = buildTurnTimelineEntries(turn, activeTurnId, isWorking);

  useLayoutEffect(() => {
    if (!isLastTurn) {
      return;
    }

    onContentLayoutChange();
  });

  return (
    <>
      {entries.map((entry, index) => {
        const isLast = isLastTurn && index === entries.length - 1;

        if (entry.type === "turnPrelude") {
          return (
            <AssistantTurnBlockX
              key={entry.key}
              turn={entry.turn}
              preludeItems={entry.items}
              isRunning={entry.isRunning}
              lastMessageRef={lastMessageRef}
              isLast={isLast}
              onOpenLink={onOpenLink}
            />
          );
        }

        const canEdit = isEditableTimelineItem(entry, editableItem);

        return (
          <MessageRowM
            key={entry.key}
            isLast={isLast}
            lastMessageRef={lastMessageRef}
            onOpenLink={onOpenLink}
            role={entry.item.role}
            phase={entry.item.phase}
            kind={entry.item.kind}
            content={entry.item.content}
            createdAt={entry.item.createdAt ?? entry.turn.completedAt ?? entry.turn.startedAt}
            details={entry.item.details}
            attachments={entry.item.attachments ?? []}
            canEdit={canEdit}
            onEdit={canEdit ? () => onStartEdit(entry.item.content) : undefined}
          />
        );
      })}
    </>
  );
}

export const ChatTurnViewX = observer(ChatTurnView);

function isEditableTimelineItem(
  entry: TimelineEntry,
  editableItem: EditableItemIdentity | null
): boolean {
  if (entry.type !== "item" || editableItem === null) {
    return false;
  }

  return entry.turn.id === editableItem.turnId && entry.item.id === editableItem.itemId;
}

function buildTurnTimelineEntries(
  turn: OpenCodexTurn,
  activeTurnId: string | null,
  isWorking: boolean
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const isRunning = isTurnRunning(turn, activeTurnId, isWorking);
  const finalAssistantContents = buildFinalAssistantContentSet(turn.items);
  const pendingPreludeItems: OpenCodexTurnItem[] = [];
  let preludeGroupIndex = 0;

  for (const item of turn.items) {
    if (isVisiblePreludeItem(item, finalAssistantContents)) {
      if (appendPreludeBeforeTrailingFinal(entries, turn, item)) {
        continue;
      }

      pendingPreludeItems.push(item);
      continue;
    }

    preludeGroupIndex = flushPreludeItems(
      entries,
      turn,
      pendingPreludeItems,
      preludeGroupIndex,
      false
    );

    entries.push({
      type: "item",
      key: buildItemKey(turn, item, entries.length),
      turn,
      item
    });
  }

  flushPreludeItems(
    entries,
    turn,
    pendingPreludeItems,
    preludeGroupIndex,
    isRunning
  );

  return entries;
}

function buildFinalAssistantContentSet(items: OpenCodexTurnItem[]): Set<string> {
  return new Set(
    items
      .filter((item) => item.role === "assistant" && item.phase === "final_answer")
      .map((item) => normalizeContent(item.content))
      .filter((content) => content.length > 0)
  );
}

function isVisiblePreludeItem(
  item: OpenCodexTurnItem,
  finalAssistantContents: Set<string>
): boolean {
  if (!isPreludeItem(item)) {
    return false;
  }

  if (item.role !== "assistant" || item.phase !== "commentary") {
    return true;
  }

  const content = normalizeContent(item.content);
  return content.length === 0 || !finalAssistantContents.has(content);
}

function appendPreludeBeforeTrailingFinal(
  entries: TimelineEntry[],
  turn: OpenCodexTurn,
  item: OpenCodexTurnItem
): boolean {
  const lastEntry = entries[entries.length - 1];

  if (!isFinalAssistantEntry(lastEntry, turn)) {
    return false;
  }

  const preludeEntry = findPreviousPreludeEntry(entries, turn);

  if (preludeEntry !== null) {
    preludeEntry.items.push(item);
    return true;
  }

  entries.splice(entries.length - 1, 0, {
    type: "turnPrelude",
    key: buildTurnPreludeKey(turn, 0, entries.length),
    turn,
    items: [item],
    isRunning: false
  });

  return true;
}

function isFinalAssistantEntry(
  entry: TimelineEntry | undefined,
  turn: OpenCodexTurn
): entry is Extract<TimelineEntry, { type: "item" }> {
  if (entry === undefined || entry.type !== "item" || entry.turn.id !== turn.id) {
    return false;
  }

  return entry.item.role === "assistant" && entry.item.phase === "final_answer";
}

function findPreviousPreludeEntry(
  entries: TimelineEntry[],
  turn: OpenCodexTurn
): Extract<TimelineEntry, { type: "turnPrelude" }> | null {
  for (let index = entries.length - 2; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry === undefined || entry.turn.id !== turn.id) {
      return null;
    }

    if (entry.type === "turnPrelude") {
      return entry;
    }
  }

  return null;
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

function flushPreludeItems(
  entries: TimelineEntry[],
  turn: OpenCodexTurn,
  pendingPreludeItems: OpenCodexTurnItem[],
  preludeGroupIndex: number,
  isRunning: boolean
): number {
  if (pendingPreludeItems.length === 0 && !isRunning) {
    return preludeGroupIndex;
  }

  entries.push({
    type: "turnPrelude",
    key: buildTurnPreludeKey(turn, preludeGroupIndex, entries.length),
    turn,
    items: [...pendingPreludeItems],
    isRunning
  });
  pendingPreludeItems.length = 0;

  return preludeGroupIndex + 1;
}

function isTurnRunning(turn: OpenCodexTurn, activeTurnId: string | null, isWorking: boolean): boolean {
  if (!isWorking) {
    return false;
  }

  const hasFinalAnswer = turn.items.some(
    (item) => item.role === "assistant" && item.phase === "final_answer"
  );

  if (hasFinalAnswer) {
    return false;
  }

  return turn.id === activeTurnId || turn.id.startsWith("pending:");
}

function buildTurnPreludeKey(turn: OpenCodexTurn, groupIndex: number, index: number): string {
  return [
    "turnPrelude",
    turn.id.length > 0 ? turn.id : "no-turn",
    groupIndex,
    index
  ].join(":");
}

function buildItemKey(turn: OpenCodexTurn, item: OpenCodexTurnItem, index: number): string {
  return [
    "turnItem",
    turn.id,
    item.role,
    item.phase ?? "none",
    item.kind ?? "none",
    item.id,
    index
  ].join(":");
}
