/** Renders one project goal from the shared catalogue. */
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import PauseOutlinedIcon from "@mui/icons-material/PauseOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { OpenCodexProjectGoal } from "@open-codex-ui/opencodex-protocol";
import { useTranslation } from "react-i18next";

import {
  formatProjectGoalDuration,
  isFinishedProjectGoalStatus
} from "./projectGoalDisplay";

type ProjectGoalRowProps = {
  goal: OpenCodexProjectGoal;
  currentChatId: string | null;
  disabled: boolean;
  onOpen(goal: OpenCodexProjectGoal): void;
  onLaunch(goal: OpenCodexProjectGoal): void;
  onPause(goal: OpenCodexProjectGoal): void;
  onArchive(goal: OpenCodexProjectGoal): void;
  onUnarchive(goal: OpenCodexProjectGoal): void;
};

/** Renders a goal row with context-aware lifecycle actions. */
export function ProjectGoalRow({
  goal,
  currentChatId,
  disabled,
  onOpen,
  onLaunch,
  onPause,
  onArchive,
  onUnarchive
}: ProjectGoalRowProps) {
  const { t } = useTranslation();
  const isAttachedToCurrentChat = goal.threadId !== null && goal.threadId === currentChatId;
  const canLaunch = !goal.isArchived && (
    goal.status === "draft" || (goal.status === "paused" && isAttachedToCurrentChat)
  );
  const canPause = !goal.isArchived && goal.status === "active" && isAttachedToCurrentChat;
  const canArchive = !goal.isArchived && isFinishedProjectGoalStatus(goal.status);
  const statusColor = readStatusColor(goal.status);
  const rowClassName = goal.isArchived
    ? "project-goal-row is-archived"
    : "project-goal-row";

  function handleOpen(): void {
    onOpen(goal);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleOpen();
  }

  function handleLaunch(event: React.MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onLaunch(goal);
  }

  function handlePause(event: React.MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onPause(goal);
  }

  function handleArchive(event: React.MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();

    if (goal.isArchived) {
      onUnarchive(goal);
      return;
    }

    onArchive(goal);
  }

  const statusLabel = t(`goals.status.${goal.status}`);
  const durationLabel = goal.launchedAt === null
    ? null
    : formatProjectGoalDuration(goal.timeUsedSeconds, t);

  return (
    <Box
      className={rowClassName}
      role="button"
      tabIndex={0}
      aria-label={goal.name}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <Tooltip title={statusLabel}>
          <Box
            component="span"
            className={`project-goal-status-icon is-${statusColor}`}
            role="img"
            aria-label={statusLabel}
          >
            <FlagOutlinedIcon fontSize="small" />
          </Box>
        </Tooltip>
        <Box sx={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {goal.name}
          </Typography>
          {durationLabel !== null ? (
            <Typography component="div" variant="caption" color="text.secondary" noWrap>
              {t("goals.elapsed", { duration: durationLabel })}
            </Typography>
          ) : null}
          {goal.threadId !== null && !isAttachedToCurrentChat ? (
            <Typography component="div" variant="caption" color="text.secondary" noWrap>
              {t("goals.attachedToOtherChat")}
            </Typography>
          ) : null}
        </Box>
        <Stack direction="row" spacing={0.25} sx={{ flex: "0 0 auto" }}>
          {canLaunch ? (
            <Tooltip title={goal.status === "paused" ? t("goals.resume") : t("goals.launch")}>
              <span>
                <IconButton
                  size="small"
                  aria-label={goal.status === "paused" ? t("goals.resume") : t("goals.launch")}
                  disabled={disabled}
                  onClick={handleLaunch}
                >
                  <PlayArrowOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
          {canPause ? (
            <Tooltip title={t("goals.pause")}>
              <span>
                <IconButton
                  size="small"
                  aria-label={t("goals.pause")}
                  disabled={disabled}
                  onClick={handlePause}
                >
                  <PauseOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
          {canArchive || goal.isArchived ? (
            <Tooltip title={goal.isArchived ? t("goals.unarchive") : t("goals.archive")}>
              <span>
                <IconButton
                  size="small"
                  aria-label={goal.isArchived ? t("goals.unarchive") : t("goals.archive")}
                  disabled={disabled}
                  onClick={handleArchive}
                >
                  {goal.isArchived ? (
                    <UnarchiveOutlinedIcon fontSize="small" />
                  ) : (
                    <ArchiveOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}

/** Maps the lifecycle state to the MUI semantic color used by the catalogue. */
function readStatusColor(
  status: OpenCodexProjectGoal["status"]
): "default" | "primary" | "success" | "warning" | "error" {
  switch (status) {
    case "active":
      return "primary";
    case "paused":
      return "warning";
    case "complete":
      return "success";
    case "blocked":
    case "usageLimited":
    case "budgetLimited":
    case "error":
      return "error";
    default:
      return "default";
  }
}
