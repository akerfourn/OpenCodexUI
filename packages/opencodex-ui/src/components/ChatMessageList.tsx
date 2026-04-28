import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";
import { useCallback, useLayoutEffect, useRef } from "react";

import type { OpenCodexMessage } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { AssistantTurnBlock } from "./AssistantTurnBlock";
import { MessageRowM } from "./MessageRow";

type ChatMessageListProps = {
  store: RootStore;
};

export function ChatMessageList({ store }: ChatMessageListProps) {
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const currentThread = store.currentThread;
  const entries = buildTimelineEntries(store.messages);
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
  }, [currentThread?.id, store.messages.length]);

  return (
    <Box
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
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;

        if (entry.type === "turnPrelude") {
          return (
            <AssistantTurnBlock
              key={entry.key}
              messages={entry.messages}
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
            role={entry.message.role}
            phase={entry.message.phase}
            kind={entry.message.kind}
            content={entry.message.content}
          />
        );
      })}
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
  | { type: "message"; key: string; message: OpenCodexMessage }
  | { type: "turnPrelude"; key: string; turnId: string; messages: OpenCodexMessage[] };

function buildTimelineEntries(messages: OpenCodexMessage[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  let pendingPrelude: OpenCodexMessage[] = [];
  let pendingPreludeTurnId: string | null = null;

  function flushPrelude(): void {
    if (pendingPrelude.length === 0) {
      return;
    }

    const firstPrelude = pendingPrelude[0];

    if (firstPrelude === undefined) {
      return;
    }

    entries.push({
      type: "turnPrelude",
      key: buildTurnPreludeKey(pendingPreludeTurnId ?? firstPrelude.turnId ?? firstPrelude.id, firstPrelude, entries.length),
      turnId: pendingPreludeTurnId ?? firstPrelude.turnId ?? firstPrelude.id,
      messages: pendingPrelude
    });
    pendingPrelude = [];
    pendingPreludeTurnId = null;
  }

  for (const message of messages) {
    if (isPreludeMessage(message)) {
      if (pendingPreludeTurnId !== null && pendingPreludeTurnId !== message.turnId) {
        flushPrelude();
      }

      pendingPreludeTurnId = message.turnId ?? pendingPreludeTurnId;
      pendingPrelude.push(message);
      continue;
    }

    if (isFinalAnswerMessage(message)) {
      flushPrelude();
      entries.push({ type: "message", key: buildMessageKey(message, entries.length), message });
      continue;
    }

    if (message.role === "user") {
      flushPrelude();
      entries.push({ type: "message", key: buildMessageKey(message, entries.length), message });
      continue;
    }

    flushPrelude();
    entries.push({ type: "message", key: buildMessageKey(message, entries.length), message });
  }

  flushPrelude();
  return entries;
}

function isPreludeMessage(message: OpenCodexMessage): boolean {
  return message.role === "activity" || (message.role === "assistant" && message.phase === "commentary");
}

function isFinalAnswerMessage(message: OpenCodexMessage): boolean {
  return message.role === "assistant" && message.phase === "final_answer";
}

function buildTurnPreludeKey(
  turnId: string,
  firstMessage: OpenCodexMessage,
  index: number
): string {
  return [
    "turnPrelude",
    turnId.length > 0 ? turnId : "no-turn",
    firstMessage.id,
    firstMessage.itemId ?? "no-item",
    index
  ].join(":");
}

function buildMessageKey(message: OpenCodexMessage, index: number): string {
  return [
    "message",
    message.turnId ?? "no-turn",
    message.role,
    message.phase ?? "none",
    message.kind ?? "none",
    message.itemId ?? message.id,
    message.id,
    index
  ].join(":");
}
