/**
 * Renders the Home vertical navigation.
 */
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import WorkspacesOutlinedIcon from "@mui/icons-material/WorkspacesOutlined";
import SubjectOutlinedIcon from "@mui/icons-material/SubjectOutlined";
import { List, ListItemButton, ListItemIcon, ListItemText, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { HomeSection } from "../../stores/HomeStore";
import type { RootStore } from "../../stores/RootStore";

type HomeSidebarProps = {
  store: RootStore;
};

/**
 * Renders Home sidebar.
 *
 * @param props Component props.
 *
 * @returns Rendered sidebar.
 */
export function HomeSidebar({ store }: HomeSidebarProps) {
  const { t } = useTranslation();
  const selectedSection = store.homeStore.selectedSection;

  function selectProjects(): void {
    selectSection("projects");
  }

  function selectSettings(): void {
    selectSection("settings");
  }

  function selectLogs(): void {
    selectSection("logs");
    void store.logsStore.loadLatest();
  }

  function selectSources(): void {
    selectSection("sources");
  }

  function selectSection(section: HomeSection): void {
    store.homeStore.selectSection(section);
  }

  return (
    <aside className="home-sidebar">
      <header className="side-header">
        <Typography variant="h6" component="h1">
          OpenCodexUI
        </Typography>
      </header>
      <List dense>
        <ListItemButton selected={selectedSection === "projects"} onClick={selectProjects}>
          <ListItemIcon>
            <WorkspacesOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("home.projects")} />
        </ListItemButton>
        <ListItemButton selected={selectedSection === "sources"} onClick={selectSources}>
          <ListItemIcon>
            <StorageOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("home.sources")} />
        </ListItemButton>
      </List>
      <List dense sx={{ mt: "auto" }}>
        <ListItemButton selected={selectedSection === "logs"} onClick={selectLogs}>
          <ListItemIcon>
            <SubjectOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("home.logs")} />
        </ListItemButton>
        <ListItemButton selected={selectedSection === "settings"} onClick={selectSettings}>
          <ListItemIcon>
            <SettingsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={t("home.settings")} />
        </ListItemButton>
      </List>
    </aside>
  );
}

export const HomeSidebarX = observer(HomeSidebar);
