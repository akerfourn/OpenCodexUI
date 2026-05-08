/**
 * Renders project opening controls on the Home tab.
 */
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Box, Button, Divider, IconButton, LinearProgress, List, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { HomeProjectListItem } from "./HomeProjectListItem";

type HomeProjectsViewProps = {
  store: RootStore;
};

/**
 * Renders Home project controls.
 *
 * @param props Component props.
 *
 * @returns Rendered project view.
 */
export function HomeProjectsView({ store }: HomeProjectsViewProps) {
  const { t } = useTranslation();

  function handlePickExisting(): void {
    store.openProjectFromPicker("open");
  }

  function handlePickNew(): void {
    store.openProjectFromPicker("create");
  }

  function handleOpenRecent(projectPath: string): void {
    store.openProject(projectPath);
  }

  function handleRefreshProjects(): void {
    store.refreshProjects();
  }

  const hasProjects = store.projects.length > 0;

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Box>
        <Typography variant="h5" component="h2">
          {t("home.openProject")}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t("home.openProjectDescription")}
        </Typography>
      </Box>

      {store.homeStore.isOpeningProject ? (
        <LinearProgress />
      ) : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button variant="contained" type="button" onClick={handlePickExisting}>
          {t("home.pickExisting")}
        </Button>
        <Button variant="outlined" type="button" onClick={handlePickNew}>
          {t("home.pickNew")}
        </Button>
      </Stack>

      <Divider />

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6" component="h3" sx={{ flex: "1 1 auto" }}>
            {t("home.recentProjects")}
          </Typography>
          <IconButton
            aria-label={t("home.refreshProjects")}
            title={t("home.refreshProjects")}
            size="small"
            onClick={handleRefreshProjects}
          >
            <RefreshOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
        {hasProjects ? (
          <List dense sx={{ mt: 1 }}>
            {store.projects.map((project) => (
              <HomeProjectListItem
                key={project.id}
                project={project}
                onOpen={handleOpenRecent}
              />
            ))}
          </List>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("home.noRecentProjects")}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

export const HomeProjectsViewX = observer(HomeProjectsView);
