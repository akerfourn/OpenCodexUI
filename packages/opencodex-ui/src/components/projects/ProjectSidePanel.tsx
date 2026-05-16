/**
 * Renders the right-side project tool panel.
 */
import { Box, Tab, Tabs } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectGitPanelX } from "./ProjectGitPanel";

type ProjectSidePanelTab = "git";

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

  function handleTabChange(_event: React.SyntheticEvent, value: ProjectSidePanelTab): void {
    setSelectedTab(value);
  }

  const panelContent = selectedTab === "git" ? (
    <ProjectGitPanelX store={store} projectStore={projectStore} />
  ) : null;

  return (
    <aside className="project-side-panel">
      <Box className="project-side-panel-tabs">
        <Tabs
          value={selectedTab}
          variant="fullWidth"
          aria-label={t("projectTools.tabs")}
          onChange={handleTabChange}
        >
          <Tab value="git" label={t("projectTools.git")} />
        </Tabs>
      </Box>
      {panelContent}
    </aside>
  );
}
