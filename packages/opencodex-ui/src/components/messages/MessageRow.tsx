/**
 * Renders the message row component for the OpenCodex UI.
 */
import { useState, type RefObject } from "react";
import { observer } from "mobx-react-lite";
import { Box, IconButton, Paper, Tooltip } from "@mui/material";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexThreadTokenUsage,
  OpenCodexTurnExecutionMetadata,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import { CopyIconButton } from "../common/CopyIconButton";
import { TurnDetailsDialog } from "../dialogs/TurnDetailsDialog";
import { ActivityKindIcon } from "./ActivityKindIcon";
import { CommandActivityRow } from "./CommandActivityRow";
import { FileChangeActivityRow } from "./FileChangeActivityRow";
import { MessageAttachmentsX } from "./MessageAttachments";
import { MarkdownMessageM } from "./MarkdownMessage";
import { formatMessageTimestamp } from "./messageTimestamp";
import { PlanActivityRowX } from "./PlanActivityRow";

type MessageRowProps = {
  item: OpenCodexTurnItem;
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
  isRunning?: boolean;
  fallbackCreatedAt?: string | null;
  turnExecution?: OpenCodexTurnExecutionMetadata | null;
  turnTokenUsage?: OpenCodexThreadTokenUsage | null;
  turnId?: string;
  showTurnDiagnostic?: boolean;
  widthMode?: "message" | "container";
  canEdit?: boolean;
  /**
   * Handles edit.
   *
   * @returns Nothing.
   */
  onEdit?(): void;
  /** Opens the developer-only diagnostic trace for the current turn. */
  onOpenTurnDiagnostic?(): void;
};

/**
 * Renders the message row component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function MessageRow({
  item,
  isLast,
  lastMessageRef,
  onOpenLink,
  isRunning = false,
  fallbackCreatedAt = null,
  turnExecution,
  turnTokenUsage,
  turnId,
  showTurnDiagnostic = false,
  widthMode = "message",
  canEdit = false,
  onEdit,
  onOpenTurnDiagnostic
}: MessageRowProps) {
  const { t } = useTranslation();
  const {
    role,
    phase,
    kind,
    content,
    createdAt,
    details,
    plan = null
  } = item;
  const isStreaming = isRunning && item.status === "streaming";
  const [isTurnDetailsOpen, setTurnDetailsOpen] = useState(false);
  const articleRef = isLast ? lastMessageRef : undefined;
  const isCommentary = role === "assistant" && phase === "commentary";
  const isSteerMessage = role === "user" && kind === "steer";
  const messageTimestamp = formatMessageTimestamp(createdAt ?? fallbackCreatedAt, t);
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
          <MessageAttachmentsX item={item} />
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
            dateTime={createdAt ?? fallbackCreatedAt ?? undefined}
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
        <PlanActivityRowX
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
          <MessageAttachmentsX item={item} />
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
              dateTime={createdAt ?? fallbackCreatedAt ?? undefined}
              sx={{
                color: "text.secondary",
                fontSize: 12,
                lineHeight: "24px"
              }}
            >
              {messageTimestamp}
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {showTurnDiagnostic && turnId !== undefined && onOpenTurnDiagnostic !== undefined ? (
                <Tooltip title={t("turnDiagnostics.title")}>
                  <IconButton
                    aria-label={t("turnDiagnostics.title")}
                    size="small"
                    onClick={onOpenTurnDiagnostic}
                    sx={{
                      color: "text.secondary",
                      height: 24,
                      width: 24,
                      p: 0.25
                    }}
                  >
                    <BugReportOutlinedIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Tooltip>
              ) : null}
              {hasTurnDetails ? (
                <Tooltip title={t("turnDetails.title")}>
                  <IconButton
                    aria-label={t("turnDetails.title")}
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

export const MessageRowX = observer(MessageRow);

function isCommandActivityKind(kind?: string): boolean {
  return kind === "commandExecution" || kind === "command";
}
