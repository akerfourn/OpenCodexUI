/**
 * Renders project opening controls on the Home tab.
 */
import { Box, Button, Divider, LinearProgress, List, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
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

  function handlePathChange(event: ChangeEvent<HTMLInputElement>): void {
    store.homeStore.setProjectPathInput(event.target.value);
  }

  function handleOpenPath(): void {
    store.openProjectFromInput(false);
  }

  function handleCreatePath(): void {
    store.openProjectFromInput(true);
  }

  function handlePickExisting(): void {
    store.openProjectFromPicker("open");
  }

  function handlePickNew(): void {
    store.openProjectFromPicker("create");
  }

  function handleOpenRecent(projectPath: string): void {
    store.openProject(projectPath);
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

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <TextField
          value={store.homeStore.projectPathInput}
          label={t("home.projectPath")}
          placeholder={t("home.projectPathPlaceholder")}
          fullWidth
          size="small"
          onChange={handlePathChange}
        />
        <Button variant="outlined" type="button" onClick={handleOpenPath}>
          {t("home.openPath")}
        </Button>
        <Button variant="outlined" type="button" onClick={handleCreatePath}>
          {t("home.createPath")}
        </Button>
      </Stack>

      <Divider />

      <Box>
        <Typography variant="h6" component="h3">
          {t("home.recentProjects")}
        </Typography>
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
