import { observer } from "mobx-react-lite";
import { Box, Paper } from "@mui/material";
import { memo, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

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
          {isCommentary ? <BrainIcon /> : <ActivityKindIcon kind={kind} />}
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
    return <BrainIcon />;
  }

  if (kind === "plan") {
    return <PlanIcon />;
  }

  if (kind === "commandExecution" || kind === "command") {
    return <TerminalIcon />;
  }

  if (kind === "mcpToolCall" || kind === "mcpTool") {
    return <PluginIcon />;
  }

  if (kind === "fileChange") {
    return <FileChangeIcon />;
  }

  if (kind === "webSearch") {
    return <SearchIcon />;
  }

  if (kind === "imageView") {
    return <ImageIcon />;
  }

  if (kind === "imageGeneration") {
    return <SparkleIcon />;
  }

  if (kind === "dynamicToolCall") {
    return <WrenchIcon />;
  }

  if (kind === "collabAgentToolCall") {
    return <AgentsIcon />;
  }

  if (kind === "enteredReviewMode") {
    return <ReviewEnterIcon />;
  }

  if (kind === "exitedReviewMode") {
    return <ReviewExitIcon />;
  }

  if (kind === "contextCompaction") {
    return <CompressIcon />;
  }

  if (kind === "hookPrompt") {
    return <HookIcon />;
  }

  return <ActivityIcon />;
}

function BaseIcon({ children }: { children: ReactNode }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      sx={{
        width: 16,
        height: 16,
        flex: "0 0 auto",
        mt: "2px",
        color: "text.secondary"
      }}
    >
      {children}
    </Box>
  );
}

function BrainIcon() {
  return (
    <BaseIcon>
      <path
        d="M9.5 4.75c-2.27 0-4.12 1.79-4.12 4 0 .98.38 1.87 1.01 2.56A3.79 3.79 0 0 0 5.2 14.1c0 1.56 1.06 2.9 2.58 3.48.39 1.22 1.6 2.12 3.02 2.12.83 0 1.6-.27 2.2-.72.6.45 1.37.72 2.2.72 1.42 0 2.63-.9 3.02-2.12 1.52-.58 2.58-1.92 2.58-3.48 0-1.03-.47-1.98-1.19-2.6.63-.69 1.01-1.58 1.01-2.56 0-2.21-1.85-4-4.12-4-.98 0-1.88.33-2.59.9-.71-.57-1.61-.9-2.59-.9-.98 0-1.88.33-2.59.9a3.99 3.99 0 0 0-2.59-.9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.3 8.1c.45-.56 1.11-.92 1.85-.92.74 0 1.4.36 1.85.92m-3.7 7.8c.45.56 1.11.92 1.85.92.74 0 1.4-.36 1.85-.92m-4.65-6.2c.64.36 1.37.55 2.15.55.77 0 1.51-.19 2.15-.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </BaseIcon>
  );
}

function PlanIcon() {
  return (
    <BaseIcon>
      <path
        d="M5.5 5.75h13M5.5 11.5h13M5.5 17.25h8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8" cy="17.25" r="1" fill="currentColor" />
    </BaseIcon>
  );
}

function TerminalIcon() {
  return (
    <BaseIcon>
      <path
        d="M4.75 6.75h14.5v10.5H4.75z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 10.5l2 1.5-2 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 13.5h3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </BaseIcon>
  );
}

function PluginIcon() {
  return (
    <BaseIcon>
      <path
        d="M9 4.75v2.5h6v-2.5m-6 0a1.25 1.25 0 0 1 1.25-1.25h3.5A1.25 1.25 0 0 1 15 4.75m-6 0v2.5h6v-2.5m0 0a1.25 1.25 0 0 1 1.25 1.25v3.5A1.25 1.25 0 0 1 15 12.75m0-5.25h2.5A1.25 1.25 0 0 1 18.75 8.75v3.5A1.25 1.25 0 0 1 17.5 13.5H15m0 0v2.5h-6v-2.5m6 0h2.5M9 13.5H6.5A1.25 1.25 0 0 1 5.25 12.25v-3.5A1.25 1.25 0 0 1 6.5 7.5H9m0 6v2.5A1.25 1.25 0 0 0 10.25 17.25h3.5A1.25 1.25 0 0 0 15 16v-2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </BaseIcon>
  );
}

function FileChangeIcon() {
  return (
    <BaseIcon>
      <path
        d="M6.5 4.75h8l3.25 3.25v11.25H6.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14.5 4.75v4h4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.25 13.25h7.5M8.25 16h5.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </BaseIcon>
  );
}

function SearchIcon() {
  return (
    <BaseIcon>
      <circle cx="11" cy="11" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.5 14.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </BaseIcon>
  );
}

function ImageIcon() {
  return (
    <BaseIcon>
      <rect x="4.75" y="5" width="14.5" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 16l3.5-3.5 2.5 2.5 2-2 3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" />
    </BaseIcon>
  );
}

function SparkleIcon() {
  return (
    <BaseIcon>
      <path d="M12 4.75l1.2 3.55 3.55 1.2-3.55 1.2L12 14.25l-1.2-3.55-3.55-1.2 3.55-1.2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M17 12.5l.7 2.05 2.05.7-2.05.7-.7 2.05-.7-2.05-2.05-.7 2.05-.7z" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </BaseIcon>
  );
}

function WrenchIcon() {
  return (
    <BaseIcon>
      <path
        d="M14.1 6.2a3.5 3.5 0 0 0-4.9 4.9l-4.2 4.2a1.2 1.2 0 0 0 1.7 1.7l4.2-4.2a3.5 3.5 0 0 0 4.9-4.9l-2 2-2.1-.1-.1-2.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </BaseIcon>
  );
}

function AgentsIcon() {
  return (
    <BaseIcon>
      <circle cx="9" cy="9" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="15" cy="10.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.75 17c.55-2.1 2.2-3.5 4.25-3.5s3.7 1.4 4.25 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.2 17c.4-1.55 1.7-2.6 3.25-2.6 1.1 0 2.1.45 2.8 1.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </BaseIcon>
  );
}

function ReviewEnterIcon() {
  return (
    <BaseIcon>
      <path d="M4.75 12c1.65-2.7 4.1-4.5 7.25-4.5S17.6 9.3 19.25 12c-1.65 2.7-4.1 4.5-7.25 4.5S6.4 14.7 4.75 12Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2.25" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </BaseIcon>
  );
}

function ReviewExitIcon() {
  return (
    <BaseIcon>
      <path d="M4.75 12c1.65-2.7 4.1-4.5 7.25-4.5 1.2 0 2.3.2 3.25.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19.25 12c-1.65 2.7-4.1 4.5-7.25 4.5-1.2 0-2.3-.2-3.25-.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 8l8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M13.5 16H16v-2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </BaseIcon>
  );
}

function CompressIcon() {
  return (
    <BaseIcon>
      <path d="M7.25 7.25h3v-3M16.75 7.25h-3v-3M7.25 16.75h3v3M16.75 16.75h-3v3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.75 9.75l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </BaseIcon>
  );
}

function HookIcon() {
  return (
    <BaseIcon>
      <path d="M8 5.75h4.75a2.75 2.75 0 0 1 0 5.5H10a2.25 2.25 0 0 0 0 4.5h6.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.25 14.5l2.25 1.75-2.25 1.75" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </BaseIcon>
  );
}

function ActivityIcon() {
  return (
    <BaseIcon>
      <circle cx="12" cy="12" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8.25v7.5M8.25 12h7.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </BaseIcon>
  );
}
