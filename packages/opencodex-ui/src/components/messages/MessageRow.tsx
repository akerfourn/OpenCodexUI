/**
 * Renders the message row component for the OpenCodex UI.
 */
import { memo, type ReactNode, type RefObject } from "react";
import { Box, Paper } from "@mui/material";
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
import { useTranslation } from "react-i18next";

import type { OpenCodexImageAttachment, OpenCodexMessage } from "@open-codex-ui/opencodex-protocol";

import { CopyIconButton } from "../common/CopyIconButton";
import { ImageAttachmentPreviewGrid } from "./ImageAttachmentPreviewGrid";
import { MarkdownMessageM } from "./MarkdownMessage";

type MessageRowProps = {
  isLast: boolean;
  lastMessageRef: RefObject<HTMLElement>;
/**
 * Handles on open link.
 *
 * @param href Link target to open.
 *
 * @returns Nothing.
 */
onOpenLink(href: string): void;
  role: OpenCodexMessage["role"];
  phase?: OpenCodexMessage["phase"];
  kind?: string;
  content: string;
  createdAt: string | null;
  attachments: OpenCodexImageAttachment[];
};

/**
 * Renders the message row component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function MessageRow({
  isLast,
  lastMessageRef,
  onOpenLink,
  role,
  phase,
  kind,
  content,
  createdAt,
  attachments
}: MessageRowProps) {
  const { t } = useTranslation();
  const articleRef = isLast ? lastMessageRef : undefined;
  const isCommentary = role === "assistant" && phase === "commentary";
  const messageTimestamp = formatMessageTimestamp(createdAt, t);

  if (role === "user") {
    return (
      <Box
        ref={articleRef}
        component="article"
        sx={{
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          alignSelf: "flex-end",
          ml: "auto",
          "&:hover .user-message-actions, &:focus-within .user-message-actions": {
            opacity: 1
          },
          "@media (min-width: 1280px)": {
            width: "80%",
            maxWidth: "80%"
          }
        }}
      >
        <Paper
          elevation={0}
          variant="outlined"
          sx={{
            minWidth: 0,
            width: "100%",
            borderColor: "#b7cef3",
            borderRadius: 2,
            bgcolor: "#eff6ff",
            boxShadow: "0 1px 2px rgb(15 23 42 / 8%)",
            overflow: "visible",
            p: 1.25,
            overflowWrap: "anywhere"
          }}
        >
          <MarkdownMessageM markdown={content} onOpenLink={onOpenLink} />
          {attachments.length > 0 ? <ImageAttachmentPreviewGrid attachments={attachments} /> : null}
        </Paper>
        <Box
          className="user-message-actions"
          sx={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            minHeight: 24,
            opacity: 0,
            px: 1.25,
            pt: 0.25,
            transition: "opacity 140ms ease"
          }}
        >
          <Box
            component="time"
            dateTime={createdAt ?? undefined}
            sx={{
              color: "text.secondary",
              fontSize: 12,
              lineHeight: "24px"
            }}
          >
            {messageTimestamp}
          </Box>
          <CopyIconButton
            value={content}
            label={t("message.copy")}
            copiedLabel={t("message.copied")}
            sx={{ color: "text.secondary" }}
          />
        </Box>
      </Box>
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
        overflowWrap: "anywhere",
        "&:hover .assistant-message-actions, &:focus-within .assistant-message-actions": {
          opacity: 1
        },
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
          {isCommentary ? <PsychologyOutlinedIcon fontSize="small" /> : renderActivityKindIcon(kind)}
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <MarkdownMessageM markdown={content} onOpenLink={onOpenLink} />
          </Box>
        </Box>
      ) : (
        <>
          <MarkdownMessageM markdown={content} onOpenLink={onOpenLink} />
          {attachments.length > 0 ? <ImageAttachmentPreviewGrid attachments={attachments} /> : null}
          <Box
            className="assistant-message-actions"
            sx={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
              minHeight: 24,
              opacity: 0,
              pt: 0.25,
              transition: "opacity 140ms ease"
            }}
          >
            <Box
              component="time"
              dateTime={createdAt ?? undefined}
              sx={{
                color: "text.secondary",
                fontSize: 12,
                lineHeight: "24px"
              }}
            >
              {messageTimestamp}
            </Box>
            <CopyIconButton
              value={content}
              label={t("message.copy")}
              copiedLabel={t("message.copied")}
              sx={{ color: "text.secondary" }}
            />
          </Box>
        </>
      )}
    </Box>
  );
}

export const MessageRowM = memo(MessageRow);

/**
 * Handles render activity kind icon.
 *
 * @param kind Kind.
 *
 * @returns Computed value.
 */
function renderActivityKindIcon(kind?: string): ReactNode {
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

function formatMessageTimestamp(
  value: string | null,
  translate: (key: string, values?: Record<string, string>) => string
): string {
  if (value === null) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);

  if (isSameDay(date, new Date())) {
    return translate("message.todayAt", { time });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, yesterday)) {
    return translate("message.yesterdayAt", { time });
  }

  const day = new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);

  return `${day} - ${time}`;
}

function isSameDay(firstDate: Date, secondDate: Date): boolean {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}
