import { observer } from "mobx-react-lite";
import { Box, Paper } from "@mui/material";
import { memo, useLayoutEffect, useRef, type RefObject } from "react";

import type { OpenCodexMessage } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";
import { MarkdownMessage } from "./MarkdownMessage";

type ChatMessageListProps = {
  store: RootStore;
};

export const ChatMessageList = observer(function ChatMessageList({ store }: ChatMessageListProps) {
  const messagesRef = useRef<HTMLDivElement | null>(null);
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
      ref={messagesRef}
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
        <MessageRow
          key={message.id}
          isLast={message.id === store.messages.at(-1)?.id}
          lastMessageRef={lastMessageRef}
          role={message.role}
          content={message.content}
        />
      ))}
    </Box>
  );
});

type MessageRowProps = {
  isLast: boolean;
  lastMessageRef: RefObject<HTMLElement>;
  role: OpenCodexMessage["role"];
  content: string;
};

const MessageRow = memo(function MessageRow({
  isLast,
  lastMessageRef,
  role,
  content
}: MessageRowProps) {
  const articleRef = isLast ? lastMessageRef : undefined;

  if (role === "user") {
    return (
      <Paper
        ref={articleRef}
        component="article"
        elevation={0}
        variant="outlined"
        sx={{
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          alignSelf: "flex-end",
          ml: "auto",
          borderColor: "#b7cef3",
          borderRadius: 2,
          bgcolor: "#eff6ff",
          boxShadow: "0 1px 2px rgb(15 23 42 / 8%)",
          overflow: "visible",
          p: 1.25,
          contentVisibility: "auto",
          containIntrinsicSize: "0 96px",
          contain: "layout paint style",
          overflowWrap: "anywhere",
          "@media (min-width: 1280px)": {
            width: "80%",
            maxWidth: "80%"
          }
        }}
      >
        <MarkdownMessage markdown={content} />
      </Paper>
    );
  }

  return (
    <Box
      ref={articleRef}
      component="article"
      sx={{
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        alignSelf: "stretch",
        overflow: "visible",
        px: 0.5,
        color: role === "activity" ? "text.secondary" : "text.primary",
        fontStyle: role === "activity" ? "italic" : "normal",
        contentVisibility: "auto",
        containIntrinsicSize: "0 96px",
        contain: "layout paint style",
        overflowWrap: "anywhere",
        "@media (min-width: 1280px)": {
          width: "80%",
          maxWidth: "80%"
        }
      }}
    >
      <MarkdownMessage markdown={content} />
    </Box>
  );
});
