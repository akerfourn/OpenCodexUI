/**
 * Renders the right-side project tool panel.
 */
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ChecklistOutlinedIcon from "@mui/icons-material/ChecklistOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import KeyboardTabOutlinedIcon from "@mui/icons-material/KeyboardTabOutlined";
import RuleOutlinedIcon from "@mui/icons-material/RuleOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import { Box, IconButton, Tab, Tabs, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectCommandsPanelX } from "./ProjectCommandsPanel";
import { ProjectComposePanelX } from "./ProjectComposePanel";
import { ProjectContextPanelX } from "./ProjectContextPanel";
import { ProjectGitPanelX } from "./ProjectGitPanel";
import { ProjectRulesPanelX } from "./ProjectRulesPanel";
import { ProjectSidePanelTabIndicator } from "./ProjectSidePanelTabIndicator";
import { ProjectSidePanelTabLabel } from "./ProjectSidePanelTabLabel";
import { ProjectTasksPanelX } from "./ProjectTasksPanel";

type ProjectSidePanelTab = "git" | "commands" | "rules" | "context" | "tasks" | "compose";
type ProjectSidePanelTabDefinition = {
  value: ProjectSidePanelTab;
  label: string;
  icon: ReactElement;
  hasActivity: boolean;
};

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
  const composeStore = projectStore.composeStore;
  const [selectedTab, setSelectedTab] = useState<ProjectSidePanelTab>("git");
  const projectPath = projectStore.project?.path;
  const sourceId = projectStore.project?.sourceId;
  const hasComposeFile = sourceId !== null && sourceId !== undefined &&
    composeStore?.isAvailable === true && readHasComposeFile(composeStore);
  const hasPendingCommitMessage = projectStore.gitStore?.commitStore?.hasDraftMessage === true;
  const hasActiveCommandRun = projectStore.commandsStore?.hasActiveRun === true;
  const hasNonStoppedComposeContainer = composeStore?.hasNonStoppedContainer === true;

  useEffect(() => {
    if (composeStore !== undefined &&
      typeof composeStore.invalidateIfUnavailable === "function") {
      composeStore.invalidateIfUnavailable();
    }
  }, [composeStore, composeStore?.isAvailable, projectPath, sourceId]);

  useEffect(() => {
    if (composeStore !== undefined && sourceId !== null && sourceId !== undefined &&
      composeStore.isAvailable && !composeStore.hasLoaded && !composeStore.isLoading) {
      void composeStore.load();
    }
  }, [composeStore, composeStore?.isAvailable, projectPath, sourceId]);

  useEffect(() => {
    if (selectedTab === "compose" && !hasComposeFile) {
      setSelectedTab("git");
    }
  }, [hasComposeFile, selectedTab]);
  const gitLabel = t("projectTools.git");
  const commandsLabel = t("projectTools.commands");
  const rulesLabel = t("projectTools.rules");
  const contextLabel = t("projectTools.context");
  const tasksLabel = t("projectTools.tasks");
  const composeLabel = t("projectTools.compose");
  const tabs: ProjectSidePanelTabDefinition[] = [
    {
      value: "git",
      label: gitLabel,
      icon: <AccountTreeOutlinedIcon fontSize="small" />,
      hasActivity: hasPendingCommitMessage
    },
    {
      value: "commands",
      label: commandsLabel,
      icon: <TerminalOutlinedIcon fontSize="small" />,
      hasActivity: hasActiveCommandRun
    },
    {
      value: "rules",
      label: rulesLabel,
      icon: <RuleOutlinedIcon fontSize="small" />,
      hasActivity: false
    },
    {
      value: "context",
      label: contextLabel,
      icon: <FolderCopyOutlinedIcon fontSize="small" />,
      hasActivity: false
    },
    {
      value: "tasks",
      label: tasksLabel,
      icon: <ChecklistOutlinedIcon fontSize="small" />,
      hasActivity: false
    }
  ];

  if (hasComposeFile) {
    tabs.push({
      value: "compose",
      label: composeLabel,
      icon: <ViewModuleOutlinedIcon fontSize="small" />,
      hasActivity: hasNonStoppedComposeContainer
    });
  }

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

  if (selectedTab === "rules") {
    panelContent = <ProjectRulesPanelX projectStore={projectStore} />;
  }

  if (selectedTab === "tasks") {
    panelContent = <ProjectTasksPanelX projectStore={projectStore} />;
  }

  if (selectedTab === "compose" && composeStore !== undefined && hasComposeFile) {
    panelContent = <ProjectComposePanelX projectStore={projectStore} />;
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
                className={
                  selectedTab === tab.value
                    ? "project-side-panel-tool-button is-active"
                    : "project-side-panel-tool-button"
                }
                aria-label={tab.label}
                aria-pressed={selectedTab === tab.value}
                onClick={() => handleCollapsedTabClick(tab.value)}
              >
                <ProjectSidePanelTabIndicator
                  icon={tab.icon}
                  hasActivity={tab.hasActivity}
                />
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
        <Tabs
          value={selectedTab}
          orientation="vertical"
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
                  icon={tab.icon}
                  hasActivity={tab.hasActivity}
                />
              }
            />
          ))}
        </Tabs>
      </Box>
      {panelContent}
    </aside>
  );
}

export const ProjectSidePanelX = observer(ProjectSidePanel);

/** Returns whether a project store has a detected Compose file. */
function readHasComposeFile(composeStore: ProjectStore["composeStore"] | undefined): boolean {
  if (composeStore === undefined) {
    return false;
  }

  const composeFile = composeStore.snapshot?.composeFile;
  return (composeFile !== null && composeFile !== undefined) || composeStore.hasComposeFile;
}
