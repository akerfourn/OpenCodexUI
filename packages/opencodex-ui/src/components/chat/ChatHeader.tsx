/**
 * Renders the chat header component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { useTranslation } from "react-i18next";

import type { OpenCodexThreadGoalStatus } from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/chat/ChatStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { RenameModal } from "../dialogs/RenameModal";
import { ThreadContextUsageIndicator } from "./ThreadContextUsageIndicator";

type ChatHeaderProps = {
  projectStore: ProjectStore;
  chatStore: ChatStore;
};

/**
 * Renders the chat header component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatHeader({ projectStore, chatStore }: ChatHeaderProps) {
  const { t } = useTranslation();
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const currentThread = chatStore.thread;
  const isReadOnlyProject = projectStore.isReadOnlyFromCache;

  const title = currentThread.title || currentThread.preview || t("chat.newConversation");
  const renameModal = isRenameModalOpen ? (
    <RenameModal
      value={renameValue}
      title={title}
      onCancel={handleRenameCancel}
      onChange={handleRenameChange}
      onSubmit={handleRenameSubmit}
    />
  ) : null;
  const goal = chatStore.goal.goal;
  const goalIndicatorLabel = goal === null
    ? null
    : getGoalIndicatorLabel(goal.status, chatStore.goal.hasStarted, t);
  const goalIndicator = goal === null ? null : (
    <Tooltip title={goalIndicatorLabel}>
      <Box
        component="span"
        role="img"
        aria-label={goalIndicatorLabel ?? undefined}
        sx={{ display: "inline-flex", alignItems: "center", mr: 0.25 }}
      >
        <FlagOutlinedIcon color={getGoalIndicatorColor(goal.status)} fontSize="small" />
      </Box>
    </Tooltip>
  );

  useEffect(() => {
    void chatStore.goal.load();
  }, [chatStore]);

  function handleRenameOpen(): void {
    if (isReadOnlyProject || chatStore.actions.isRenaming) {
      return;
    }

    setRenameValue(title);
    setIsRenameModalOpen(true);
  }

  function handleRenameCancel(): void {
    setIsRenameModalOpen(false);
    setRenameValue("");
  }

  function handleRenameChange(value: string): void {
    setRenameValue(value);
  }

  function handleRenameSubmit(): void {
    if (renameValue.trim().length > 0 && !chatStore.actions.isRenaming) {
      chatStore.actions.rename(renameValue);
      setIsRenameModalOpen(false);
      setRenameValue("");
    }
  }

  function handleRefreshThread(): void {
    chatStore.actions.refresh();
  }

  return (
    <>
      <Box component="header" className="chat-header" sx={{ position: "relative" }}>
        <Box className="chat-title" sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <ThreadContextUsageIndicator usage={chatStore.timeline.tokenUsage} />
          {goalIndicator}
          <Typography variant="h6" component="h2" noWrap>
            {title}
          </Typography>
          <IconButton
            className="chat-title-inline-action"
            aria-label={t("header.rename")}
            title={t("header.rename")}
            size="small"
            disabled={isReadOnlyProject || chatStore.actions.isRenaming}
            onClick={handleRenameOpen}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <Box className="chat-title-spacer" />
          <Box className="chat-header-actions">
            <IconButton
              aria-label={t("header.refresh")}
              title={t("header.refresh")}
              size="small"
              disabled={
                isReadOnlyProject ||
                chatStore.runtime.isRefreshing ||
                chatStore.runtime.isSyncing
              }
              onClick={handleRefreshThread}
            >
              {chatStore.runtime.isRefreshing || chatStore.runtime.isSyncing ? (
                <CircularProgress size={18} thickness={5} />
              ) : (
                <RefreshOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Box>
      </Box>
      {renameModal}
    </>
  );
}

export const ChatHeaderX = observer(ChatHeader);

/** Selects the compact color used for the goal lifecycle indicator. */
function getGoalIndicatorColor(
  status: OpenCodexThreadGoalStatus
): "disabled" | "primary" | "success" | "error" {
  if (status === "active") {
    return "primary";
  }

  if (status === "complete") {
    return "success";
  }

  if (status === "blocked" || status === "usageLimited" || status === "budgetLimited") {
    return "error";
  }

  return "disabled";
}

/** Builds an accessible localized description for the lifecycle indicator. */
function getGoalIndicatorLabel(
  status: OpenCodexThreadGoalStatus,
  hasStarted: boolean,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  let statusLabel: string;

  switch (status) {
    case "active":
      statusLabel = translate("goal.active");
      break;
    case "paused":
      statusLabel = hasStarted ? translate("goal.paused") : translate("goal.defined");
      break;
    case "blocked":
      statusLabel = translate("goal.blocked");
      break;
    case "usageLimited":
      statusLabel = translate("goal.usageLimited");
      break;
    case "budgetLimited":
      statusLabel = translate("goal.budgetLimited");
      break;
    case "complete":
      statusLabel = translate("goal.complete");
      break;
  }

  return translate("goal.indicator", { status: statusLabel });
}
