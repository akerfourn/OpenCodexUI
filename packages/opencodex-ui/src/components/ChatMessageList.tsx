import { observer } from "mobx-react-lite";
import { Box, Paper } from "@mui/material";
import { memo, useLayoutEffect, useRef, type RefObject } from "react";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import FormatListBulletedOutlinedIcon from "@mui/icons-material/FormatListBulletedOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";

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
          phase={message.phase}
          kind={message.kind}
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
  phase?: OpenCodexMessage["phase"];
  kind?: string;
  content: string;
};

const MessageRow = memo(function MessageRow({
  isLast,
  lastMessageRef,
  role,
  phase,
  kind,
  content
}: MessageRowProps) {
  const articleRef = isLast ? lastMessageRef : undefined;
  const isCommentary = role === "assistant" && phase === "commentary";

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
      {role === "activity" || isCommentary ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            minWidth: 0
          }}
        >
          {isCommentary ? <PsychologyOutlinedIcon fontSize="small" /> : <ActivityKindIcon kind={kind} />}
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <MarkdownMessage markdown={content} />
          </Box>
        </Box>
      ) : (
        <MarkdownMessage markdown={content} />
      )}
    </Box>
  );
});

function ActivityKindIcon({ kind }: { kind?: string }) {
  if (kind === "reasoning") {
    return <PsychologyOutlinedIcon fontSize="small" />;
  }

  if (kind === "plan") {
    return <FormatListBulletedOutlinedIcon fontSize="small" />;
  }

  if (kind === "commandExecution" || kind === "command") {
    return <TerminalOutlinedIcon fontSize="small" />;
  }

  if (kind === "mcpToolCall" || kind === "mcpTool") {
    return <ExtensionOutlinedIcon fontSize="small" />;
  }

  if (kind === "fileChange") {
    return <DescriptionOutlinedIcon fontSize="small" />;
  }

  if (kind === "webSearch") {
    return <SearchOutlinedIcon fontSize="small" />;
  }

  if (kind === "imageView") {
    return <ImageOutlinedIcon fontSize="small" />;
  }

  if (kind === "imageGeneration") {
    return <AutoAwesomeOutlinedIcon fontSize="small" />;
  }

  if (kind === "dynamicToolCall") {
    return <BuildOutlinedIcon fontSize="small" />;
  }

  if (kind === "collabAgentToolCall") {
    return <GroupsOutlinedIcon fontSize="small" />;
  }

  if (kind === "enteredReviewMode") {
    return <VisibilityOutlinedIcon fontSize="small" />;
  }

  if (kind === "exitedReviewMode") {
    return <VisibilityOffOutlinedIcon fontSize="small" />;
  }

  if (kind === "contextCompaction") {
    return <CompressOutlinedIcon fontSize="small" />;
  }

  if (kind === "hookPrompt") {
    return <CodeOutlinedIcon fontSize="small" />;
  }

  return <MoreHorizOutlinedIcon fontSize="small" />;
}
