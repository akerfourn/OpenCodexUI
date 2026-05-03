import { observer } from "mobx-react-lite";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useCallback, useLayoutEffect, useRef, type UIEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { AssistantTurnBlock } from "./AssistantTurnBlock";
import { MessageRowM } from "./MessageRow";

type ChatMessageListProps = {
  store: RootStore;
};

export function ChatMessageList({ store }: ChatMessageListProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const previousScrollStateRef = useRef<{ height: number; top: number } | null>(null);
  const currentThread = store.currentThread;
  const entries = buildTimelineEntries(store.turns, store.activeTurnId, store.isWorking || store.isStartingTurn);
  const handleOpenLink = useCallback((href: string) => {
    store.openExternalLink(href);
  }, [store]);

  useLayoutEffect(() => {
    const element = scrollAnchorRef.current;

    if (element === null) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      element.scrollIntoView({ block: "end", inline: "nearest" });
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [currentThread?.id, store.scrollToBottomVersion]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const previousState = previousScrollStateRef.current;

    if (container === null || previousState === null) {
      return;
    }

    container.scrollTop = container.scrollHeight - previousState.height + previousState.top;
    previousScrollStateRef.current = null;
  }, [store.olderMessagesPrependVersion]);

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const container = event.currentTarget;

    if (
      container.scrollTop > 80 ||
      store.isLoadingOlderMessages ||
      !store.hasMoreOlderMessages
    ) {
      return;
    }

    previousScrollStateRef.current = {
      height: container.scrollHeight,
      top: container.scrollTop
    };
    store.loadOlderMessages();
  }

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        minHeight: 0,
        overflowX: "hidden",
        overflowY: "auto",
        gap: 1.25,
        px: 2,
        py: 2.25
      }}
    >
      {store.isLoadingOlderMessages ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <CircularProgress size={18} thickness={5} />
        </Box>
      ) : null}
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;

        if (entry.type === "turnPrelude") {
          return (
            <AssistantTurnBlock
              key={entry.key}
              turn={entry.turn}
              isRunning={entry.isRunning}
              lastMessageRef={lastMessageRef}
              isLast={isLast}
              onOpenLink={handleOpenLink}
            />
          );
        }

        return (
          <MessageRowM
            key={entry.key}
            isLast={isLast}
            lastMessageRef={lastMessageRef}
            onOpenLink={handleOpenLink}
            role={entry.item.role}
            phase={entry.item.phase}
            kind={entry.item.kind}
            content={entry.item.content}
          />
        );
      })}
      {store.isSyncingCurrentThread && store.turns.length > 0 ? (
        <Box
          sx={{
            alignItems: "center",
            color: "text.secondary",
            display: "flex",
            gap: 1,
            justifyContent: "center",
            py: 1
          }}
        >
          <CircularProgress size={16} thickness={5} />
          <Typography variant="caption">
            {t("chat.syncing")}
          </Typography>
        </Box>
      ) : null}
      <Box
        ref={scrollAnchorRef}
        aria-hidden="true"
        sx={{
          width: 1,
          height: 1,
          mt: "-1px",
          flex: "0 0 auto",
          overflow: "hidden",
          pointerEvents: "none"
        }}
      />
    </Box>
  );
}

export const ChatMessageListX = observer(ChatMessageList);

type TimelineEntry =
  | { type: "item"; key: string; turn: OpenCodexTurn; item: OpenCodexTurnItem }
  | { type: "turnPrelude"; key: string; turn: OpenCodexTurn; isRunning: boolean };

function buildTimelineEntries(
  turns: OpenCodexTurn[],
  activeTurnId: string | null,
  isWorking: boolean
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const turn of turns) {
    const preludeItems = turn.items.filter(isPreludeItem);
    const userItems = turn.items.filter((item) => item.role === "user");
    const finalItems = turn.items.filter((item) => item.role !== "user" && !isPreludeItem(item));
    const isRunning = isTurnRunning(turn, activeTurnId, isWorking);

    for (const item of userItems) {
      entries.push({
        type: "item",
        key: buildItemKey(turn, item, entries.length),
        turn,
        item
      });
    }

    if (preludeItems.length > 0 || isRunning) {
      entries.push({
        type: "turnPrelude",
        key: buildTurnPreludeKey(turn, entries.length),
        turn,
        isRunning
      });
    }

    for (const item of finalItems) {
      entries.push({
        type: "item",
        key: buildItemKey(turn, item, entries.length),
        turn,
        item
      });
    }
  }

  return entries;
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

function isPreludeItem(item: OpenCodexTurnItem): boolean {
  return item.role === "activity" || (item.role === "assistant" && item.phase === "commentary");
}

function buildTurnPreludeKey(turn: OpenCodexTurn, index: number): string {
  return [
    "turnPrelude",
    turn.id.length > 0 ? turn.id : "no-turn",
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
