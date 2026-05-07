/**
 * Renders the top-level Home and project tabs.
 */
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import { Box, Tab, Tabs } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import { HOME_TAB_ID, type RootStore } from "../../stores/RootStore";
import { ProjectTabLabel } from "./ProjectTabLabel";

type AppTabsProps = {
  store: RootStore;
};

/**
 * Renders application tabs.
 *
 * @param props Component props.
 *
 * @returns Rendered tabs.
 */
export function AppTabs({ store }: AppTabsProps) {
  const { t } = useTranslation();

  function handleTabChange(_event: unknown, value: string): void {
    store.activateTab(value);
  }

  function handleProjectClose(projectId: string): void {
    store.requestCloseProject(projectId);
  }

  return (
    <Box className="app-tabs">
      <Tabs
        value={store.activeTabId}
        aria-label={t("tabs.label")}
        variant="scrollable"
        scrollButtons="auto"
        onChange={handleTabChange}
      >
        <Tab
          value={HOME_TAB_ID}
          label={t("tabs.home")}
          icon={<HomeOutlinedIcon fontSize="small" />}
          iconPosition="start"
        />
        {store.projectTabStores.map((projectStore) => (
          <Tab
            key={projectStore.project.id}
            value={projectStore.project.id}
            label={<ProjectTabLabel projectStore={projectStore} onClose={handleProjectClose} />}
          />
        ))}
      </Tabs>
    </Box>
  );
}

export const AppTabsX = observer(AppTabs);
