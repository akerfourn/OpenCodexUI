/** Renders project goals grouped by their current chat association. */
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { Box, Collapse, IconButton, Stack, Typography } from "@mui/material";
import type { OpenCodexProjectGoal } from "@open-codex-ui/opencodex-protocol";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ProjectGoalRow } from "./ProjectGoalRow";
import { groupProjectGoals } from "./projectGoalSections";

type ProjectGoalActions = {
  onOpen(goal: OpenCodexProjectGoal): void;
  onLaunch(goal: OpenCodexProjectGoal): void;
  onPause(goal: OpenCodexProjectGoal): void;
  onArchive(goal: OpenCodexProjectGoal): void;
  onUnarchive(goal: OpenCodexProjectGoal): void;
};

type ProjectGoalSectionsProps = ProjectGoalActions & {
  goals: OpenCodexProjectGoal[];
  currentChatId: string | null;
  currentChatTitle: string | null;
  disabled: boolean;
};

/** Renders the current-chat and project-level goal sections. */
export function ProjectGoalSections({
  goals,
  currentChatId,
  currentChatTitle,
  disabled,
  onOpen,
  onLaunch,
  onPause,
  onArchive,
  onUnarchive
}: ProjectGoalSectionsProps) {
  const { t } = useTranslation();
  const groups = groupProjectGoals(goals, currentChatId);
  const currentChatSection = currentChatId === null ? null : (
    <ProjectGoalSection
      sectionId="project-goals-current-chat"
      title={t("goals.currentChatSection", { chat: currentChatTitle ?? t("goals.noChat") })}
      goals={groups.currentChat}
      currentChatId={currentChatId}
      disabled={disabled}
      emptyMessage={t("goals.currentChatEmpty")}
      onOpen={onOpen}
      onLaunch={onLaunch}
      onPause={onPause}
      onArchive={onArchive}
      onUnarchive={onUnarchive}
    />
  );

  return (
    <Stack className="project-goal-sections" spacing={1.5}>
      {currentChatSection}
      <ProjectGoalSection
        sectionId="project-goals-unassigned"
        title={t("goals.projectSection")}
        description={t("goals.projectSectionDescription")}
        goals={groups.unassigned}
        currentChatId={currentChatId}
        disabled={disabled}
        emptyMessage={t("goals.projectEmpty")}
        onOpen={onOpen}
        onLaunch={onLaunch}
        onPause={onPause}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
      />
      {groups.otherChats.length > 0 ? (
        <ProjectGoalSection
          sectionId="project-goals-other-chats"
          title={t("goals.otherChatsSection")}
          goals={groups.otherChats}
          currentChatId={currentChatId}
          disabled={disabled}
          collapsible
          onOpen={onOpen}
          onLaunch={onLaunch}
          onPause={onPause}
          onArchive={onArchive}
          onUnarchive={onUnarchive}
        />
      ) : null}
    </Stack>
  );
}

type ProjectGoalSectionProps = ProjectGoalActions & {
  sectionId: string;
  title: string;
  description?: string;
  goals: OpenCodexProjectGoal[];
  currentChatId: string | null;
  disabled: boolean;
  emptyMessage?: string;
  collapsible?: boolean;
};

/** Renders one goal section and optionally keeps its rows collapsed by default. */
function ProjectGoalSection({
  sectionId,
  title,
  description,
  goals,
  currentChatId,
  disabled,
  emptyMessage,
  collapsible = false,
  onOpen,
  onLaunch,
  onPause,
  onArchive,
  onUnarchive
}: ProjectGoalSectionProps) {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(collapsible);
  const toggleLabel = isCollapsed
    ? t("goals.expandOtherChats")
    : t("goals.collapseOtherChats");
  const expandIcon = isCollapsed
    ? <ChevronRightOutlinedIcon fontSize="small" />
    : <ExpandMoreOutlinedIcon fontSize="small" />;
  const goalRows = goals.length === 0
    ? <Typography variant="caption" color="text.secondary">{emptyMessage}</Typography>
    : (
      <Stack className="project-goal-section-rows" spacing={0.75}>
        {goals.map((goal) => (
          <ProjectGoalRow
            key={goal.id}
            goal={goal}
            currentChatId={currentChatId}
            disabled={disabled}
            onOpen={onOpen}
            onLaunch={onLaunch}
            onPause={onPause}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        ))}
      </Stack>
    );
  const sectionBody = collapsible ? (
    <Collapse in={!isCollapsed} unmountOnExit>
      <Box id={`${sectionId}-content`} className="project-goal-section-content">
        {goalRows}
      </Box>
    </Collapse>
  ) : (
    <Box id={`${sectionId}-content`} className="project-goal-section-content">
      {goalRows}
    </Box>
  );

  function handleToggle(): void {
    setIsCollapsed((collapsed) => !collapsed);
  }

  return (
    <Box component="section" className="project-goal-section" aria-label={title}>
      <Box className="project-goal-section-header">
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="subtitle2" noWrap>
            {title}
          </Typography>
          {description !== undefined ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {description}
            </Typography>
          ) : null}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {goals.length}
        </Typography>
        {collapsible ? (
          <IconButton
            size="small"
            aria-label={toggleLabel}
            aria-controls={`${sectionId}-content`}
            aria-expanded={!isCollapsed}
            onClick={handleToggle}
          >
            {expandIcon}
          </IconButton>
        ) : null}
      </Box>
      {sectionBody}
    </Box>
  );
}

export const ProjectGoalSectionsX = ProjectGoalSections;
