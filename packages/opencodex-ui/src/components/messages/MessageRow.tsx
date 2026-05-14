/**
 * Renders the message row component for the OpenCodex UI.
 */
import { memo, type ReactNode, type RefObject } from "react";
import { Box, IconButton, Paper, Tooltip } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
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
import { CommandActivityRow } from "./CommandActivityRow";
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
  details?: string | null;
  attachments: OpenCodexImageAttachment[];
  canEdit?: boolean;
  /**
   * Handles edit.
   *
   * @returns Nothing.
   */
  onEdit?(): void;
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
  details,
  attachments,
  canEdit = false,
  onEdit
}: MessageRowProps) {
  const { t } = useTranslation();
  const articleRef = isLast ? lastMessageRef : undefined;
  const isCommentary = role === "assistant" && phase === "commentary";
  const isSteerMessage = role === "user" && kind === "steer";
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
            borderColor: (theme) => theme.palette.mode === "dark"
              ? "rgba(88, 166, 255, 0.45)"
              : "#b7cef3",
            borderStyle: isSteerMessage ? "dashed" : "solid",
            borderRadius: 2,
            bgcolor: (theme) => {
              if (theme.palette.mode === "dark") {
                return isSteerMessage
                  ? "rgba(88, 166, 255, 0.08)"
                  : "rgba(88, 166, 255, 0.14)";
              }

              return isSteerMessage ? "#f8fbff" : "#eff6ff";
            },
            boxShadow: (theme) => theme.palette.mode === "dark"
              ? "0 1px 2px rgb(0 0 0 / 24%)"
              : "0 1px 2px rgb(15 23 42 / 8%)",
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
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {canEdit && onEdit !== undefined ? (
              <Tooltip title={t("message.edit")}>
                <IconButton
                  aria-label={t("message.edit")}
                  size="small"
                  onClick={onEdit}
                  sx={{
                    color: "text.secondary",
                    height: 24,
                    width: 24,
                    p: 0.25
                  }}
                >
                  <EditOutlinedIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            ) : null}
            <CopyIconButton
              value={content}
              label={t("message.copy")}
              copiedLabel={t("message.copied")}
              sx={{ color: "text.secondary" }}
            />
          </Box>
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
      {role === "activity" && isCommandActivityKind(kind) ? (
        <CommandActivityRow
          content={content}
          details={details}
          icon={renderActivityKindIcon(kind)}
        />
      ) : role === "activity" || isCommentary ? (
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

function isCommandActivityKind(kind?: string): boolean {
  return kind === "commandExecution" || kind === "command";
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
