import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";
import { useLayoutEffect, useRef } from "react";

import type { RootStore } from "../stores/RootStore";
import { MessageRowM } from "./MessageRow";

type ChatMessageListProps = {
  store: RootStore;
};

export function ChatMessageList({ store }: ChatMessageListProps) {
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const currentThread = store.currentThread;

  useLayoutEffect(() => {
    const element = lastMessageRef.current;

    if (element === null) {
      return;
    }

    element.scrollIntoView({ block: "end" });
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
      {store.messages.map((message) => (
        <MessageRowM
          key={message.id}
          isLast={message.id === store.messages.at(-1)?.id}
          lastMessageRef={lastMessageRef}
          role={message.role}
          phase={message.phase}
          kind={message.kind}
          content={message.content}
        />
      ))}
    </Box>
  );
}

export const ChatMessageListX = observer(ChatMessageList);
