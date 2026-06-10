/**
 * Renders the right-side project tool panel.
 */
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import KeyboardTabOutlinedIcon from "@mui/icons-material/KeyboardTabOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import { Box, IconButton, Tab, Tabs, Tooltip } from "@mui/material";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectCommandsPanelX } from "./ProjectCommandsPanel";
import { ProjectContextPanelX } from "./ProjectContextPanel";
import { ProjectGitPanelX } from "./ProjectGitPanel";
import { ProjectSidePanelTabLabel } from "./ProjectSidePanelTabLabel";
import { ProjectTasksPanelX } from "./ProjectTasksPanel";

type ProjectSidePanelTab = "git" | "commands" | "context" | "tasks";

type ProjectSidePanelProps = {
  store: RootStore;
  projectStore: ProjectStore;
  isCollapsed: boolean;
  onCollapsedChange(value: boolean): void;
};

/**
 * Renders project tools in a tabbed right-side panel.
 *
 * @param props Component props.
 *
 * @returns Rendered project side panel.
 */
export function ProjectSidePanel({
  store,
  projectStore,
  isCollapsed,
  onCollapsedChange
}: ProjectSidePanelProps) {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState<ProjectSidePanelTab>("git");
  const gitLabel = t("projectTools.git");
  const commandsLabel = t("projectTools.commands");
  const contextLabel = t("projectTools.context");
  const tasksLabel = t("projectTools.tasks");
  const tabs = [
    {
      value: "git" as const,
      label: gitLabel,
      icon: <AccountTreeOutlinedIcon fontSize="small" />
    },
    {
      value: "commands" as const,
      label: commandsLabel,
      icon: <TerminalOutlinedIcon fontSize="small" />
    },
    {
      value: "context" as const,
      label: contextLabel,
      icon: <FolderCopyOutlinedIcon fontSize="small" />
    },
    {
      value: "tasks" as const,
      label: tasksLabel,
      icon: <ChecklistOutlinedIcon fontSize="small" />
    }
  ];

  function handleTabChange(_event: React.SyntheticEvent, value: ProjectSidePanelTab): void {
    setSelectedTab(value);
  }

  function handleCollapse(): void {
    onCollapsedChange(true);
  }

  function handleExpand(): void {
    onCollapsedChange(false);
  }

  function handleCollapsedTabClick(value: ProjectSidePanelTab): void {
    setSelectedTab(value);
    onCollapsedChange(false);
  }

  let panelContent = <ProjectGitPanelX store={store} projectStore={projectStore} />;

  if (selectedTab === "commands") {
    panelContent = <ProjectCommandsPanelX projectStore={projectStore} />;
  }

  if (selectedTab === "context") {
    panelContent = <ProjectContextPanelX projectStore={projectStore} />;
  }

  if (selectedTab === "tasks") {
    panelContent = <ProjectTasksPanelX projectStore={projectStore} />;
  }

  if (isCollapsed) {
    return (
      <aside className="project-side-panel is-collapsed">
        <Box className="project-side-panel-rail">
          <Tooltip title={t("projectTools.openPanel")} placement="left">
            <IconButton
              size="small"
              aria-label={t("projectTools.openPanel")}
              onClick={handleExpand}
            >
              <KeyboardTabOutlinedIcon className="project-side-panel-expand-icon" fontSize="small" />
            </IconButton>
          </Tooltip>
          {tabs.map((tab) => (
            <Tooltip key={tab.value} title={tab.label} placement="left">
              <IconButton
                size="small"
                color={selectedTab === tab.value ? "primary" : "default"}
                aria-label={tab.label}
                onClick={() => handleCollapsedTabClick(tab.value)}
              >
                {tab.icon}
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      </aside>
    );
  }

  return (
    <aside className="project-side-panel">
      <Box className="project-side-panel-tabs">
        <Tabs
          value={selectedTab}
          variant="scrollable"
          scrollButtons="auto"
          aria-label={t("projectTools.tabs")}
          onChange={handleTabChange}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              aria-label={tab.label}
              label={
                <ProjectSidePanelTabLabel
                  label={tab.label}
                  icon={tab.icon as ReactElement}
                />
              }
            />
          ))}
        </Tabs>
        <Tooltip title={t("projectTools.closePanel")} placement="left">
          <IconButton
            className="project-side-panel-collapse-button"
            size="small"
            aria-label={t("projectTools.closePanel")}
            onClick={handleCollapse}
          >
            <KeyboardTabOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
      {panelContent}
    </aside>
  );
}
