/**
 * Renders the message row component for the OpenCodex UI.
 */
import { memo, useState, type RefObject } from "react";
import { Box, IconButton, Paper, Tooltip } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexPlanSnapshot,
  OpenCodexThreadTokenUsage,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";

import { CopyIconButton } from "../common/CopyIconButton";
import { TurnDetailsDialog } from "../dialogs/TurnDetailsDialog";
import { ActivityKindIcon } from "./ActivityKindIcon";
import { CommandActivityRow } from "./CommandActivityRow";
import { FileChangeActivityRow } from "./FileChangeActivityRow";
import { ImageAttachmentPreviewGrid } from "./ImageAttachmentPreviewGrid";
import { MarkdownMessageM } from "./MarkdownMessage";
import { formatMessageTimestamp } from "./messageTimestamp";
import { PlanActivityRow } from "./PlanActivityRow";

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
  isStreaming?: boolean;
  createdAt: string | null;
  details?: string | null;
  plan?: OpenCodexPlanSnapshot | null;
  attachments: OpenCodexImageAttachment[];
  turnExecution?: OpenCodexTurnExecutionMetadata | null;
  turnTokenUsage?: OpenCodexThreadTokenUsage | null;
  widthMode?: "message" | "container";
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
  isStreaming = false,
  createdAt,
  details,
  plan = null,
  attachments,
  turnExecution,
  turnTokenUsage,
  widthMode = "message",
  canEdit = false,
  onEdit
}: MessageRowProps) {
  const { t } = useTranslation();
  const [isTurnDetailsOpen, setTurnDetailsOpen] = useState(false);
  const articleRef = isLast ? lastMessageRef : undefined;
  const isCommentary = role === "assistant" && phase === "commentary";
  const isSteerMessage = role === "user" && kind === "steer";
  const messageTimestamp = formatMessageTimestamp(createdAt, t);
  const hasTurnDetails = turnExecution !== undefined && turnExecution !== null ||
    turnTokenUsage !== undefined && turnTokenUsage !== null;

  if (role === "user") {
    return (
      <Box
        ref={articleRef}
        component="article"
        sx={{
          flex: "0 0 auto",
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          alignSelf: "flex-end",
          ml: "auto",
          "&:hover .user-message-actions, &:focus-within .user-message-actions": {
            opacity: 1
          },
          ...(widthMode === "message" ? {
            "@media (min-width: 1280px)": {
              width: "80%",
              maxWidth: "80%"
            }
          } : {})
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
          <MarkdownMessageM
            markdown={content}
            requireModifiedClick
            onOpenLink={onOpenLink}
          />
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
        flex: "0 0 auto",
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
        ...(widthMode === "message" ? {
          "@media (min-width: 1280px)": {
            width: "80%",
            maxWidth: "80%"
          }
        } : {})
      }}
    >
      {role === "activity" && isCommandActivityKind(kind) ? (
        <CommandActivityRow
          content={content}
          details={details}
          icon={<ActivityKindIcon kind={kind} />}
        />
      ) : role === "activity" && kind === "fileChange" ? (
        <FileChangeActivityRow
          content={content}
          details={details}
          icon={<ActivityKindIcon kind={kind} />}
        />
      ) : role === "activity" && kind === "plan" && plan !== null ? (
        <PlanActivityRow
          plan={plan}
          icon={<ActivityKindIcon kind={kind} />}
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
          {isCommentary
            ? <ActivityKindIcon kind="reasoning" />
            : <ActivityKindIcon kind={kind} />}
          <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
            <MarkdownMessageM
              markdown={content}
              isStreaming={isStreaming}
              requireModifiedClick
              onOpenLink={onOpenLink}
            />
          </Box>
        </Box>
      ) : (
        <>
          <MarkdownMessageM
            markdown={content}
            isStreaming={isStreaming}
            requireModifiedClick
            onOpenLink={onOpenLink}
          />
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
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {hasTurnDetails ? (
                <Tooltip title={t("message.turnDetails")}>
                  <IconButton
                    aria-label={t("message.turnDetails")}
                    size="small"
                    onClick={() => setTurnDetailsOpen(true)}
                    sx={{
                      color: "text.secondary",
                      height: 24,
                      width: 24,
                      p: 0.25
                    }}
                  >
                    <InfoOutlinedIcon sx={{ fontSize: 15 }} />
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
        </>
      )}
      {hasTurnDetails ? (
        <TurnDetailsDialog
          open={isTurnDetailsOpen}
          execution={turnExecution}
          tokenUsage={turnTokenUsage}
          onClose={() => setTurnDetailsOpen(false)}
        />
      ) : null}
    </Box>
  );
}

export const MessageRowM = memo(MessageRow);

function isCommandActivityKind(kind?: string): boolean {
  return kind === "commandExecution" || kind === "command";
}
