/**
 * Renders the right-side project tool panel.
 */
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectCommandsPanelX } from "./ProjectCommandsPanel";
import { ProjectContextPanelX } from "./ProjectContextPanel";
import { ProjectGitPanelX } from "./ProjectGitPanel";
import { ProjectSidePanelTabLabel } from "./ProjectSidePanelTabLabel";

type ProjectSidePanelTab = "git" | "commands" | "context";

type ProjectSidePanelProps = {
  store: RootStore;
  projectStore: ProjectStore;
};

/**
 * Renders project tools in a tabbed right-side panel.
 *
 * @param props Component props.
 *
 * @returns Rendered project side panel.
 */
export function ProjectSidePanel({ store, projectStore }: ProjectSidePanelProps) {
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState<ProjectSidePanelTab>("git");
  const gitLabel = t("projectTools.git");
  const commandsLabel = t("projectTools.commands");
  const contextLabel = t("projectTools.context");

  function handleTabChange(_event: React.SyntheticEvent, value: ProjectSidePanelTab): void {
    setSelectedTab(value);
  }

  let panelContent = <ProjectGitPanelX store={store} projectStore={projectStore} />;

  if (selectedTab === "commands") {
    panelContent = <ProjectCommandsPanelX projectStore={projectStore} />;
  }

  if (selectedTab === "context") {
    panelContent = <ProjectContextPanelX projectStore={projectStore} />;
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
          <Tab
            value="git"
            aria-label={gitLabel}
            label={
              <ProjectSidePanelTabLabel
                label={gitLabel}
                icon={<AccountTreeOutlinedIcon fontSize="small" />}
              />
            }
          />
          <Tab
            value="commands"
            aria-label={commandsLabel}
            label={
              <ProjectSidePanelTabLabel
                label={commandsLabel}
                icon={<TerminalOutlinedIcon fontSize="small" />}
              />
            }
          />
          <Tab
            value="context"
            aria-label={contextLabel}
            label={
              <ProjectSidePanelTabLabel
                label={contextLabel}
                icon={<FolderCopyOutlinedIcon fontSize="small" />}
              />
            }
          />
        </Tabs>
      </Box>
      {panelContent}
    </aside>
  );
}
