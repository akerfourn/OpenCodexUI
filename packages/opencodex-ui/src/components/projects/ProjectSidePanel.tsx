/**
 * Renders the right-side project tool panel.
 */
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectCommandsPanelX } from "./ProjectCommandsPanel";
import { ProjectGitPanelX } from "./ProjectGitPanel";
import { ProjectSidePanelTabLabel } from "./ProjectSidePanelTabLabel";

type ProjectSidePanelTab = "git" | "commands";

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

  function handleTabChange(_event: React.SyntheticEvent, value: ProjectSidePanelTab): void {
    setSelectedTab(value);
  }

  const panelContent = selectedTab === "git"
    ? <ProjectGitPanelX store={store} projectStore={projectStore} />
    : <ProjectCommandsPanelX projectStore={projectStore} />;

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
        </Tabs>
      </Box>
      {panelContent}
    </aside>
  );
}
