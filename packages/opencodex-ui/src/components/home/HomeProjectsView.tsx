/**
 * Renders project opening controls on the Home tab.
 */
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
  Button,
  Divider,
  IconButton,
  LinearProgress,
  List,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
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

  function handleOpenRecent(projectPath: string, sourceId: string | null): void {
    store.openProject(projectPath, false, sourceId);
  }

  function handleRefreshProjects(): void {
    store.refreshProjects();
  }

  function handleToggleHiddenProjects(): void {
    store.setShowHiddenProjects(!store.homeStore.showHiddenProjects);
  }

  function handleSetProjectHidden(projectId: string, isHidden: boolean): void {
    store.setProjectHidden(projectId, isHidden);
  }

  function handleSourceChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setHomeSelectedSource(event.target.value);
  }

  const hiddenProjectCount = store.projects.filter((project) => project.isHidden).length;
  const visibleProjects = store.homeStore.showHiddenProjects
    ? store.projects
    : store.projects.filter((project) => !project.isHidden);
  const hasProjects = visibleProjects.length > 0;
  const sourceById = new Map(store.sources.map((source) => [source.id, source]));
  const hiddenProjectsButtonLabel = store.homeStore.showHiddenProjects
    ? t("home.hideHiddenProjects")
    : t("home.showHiddenProjects");

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
        <TextField
          select
          size="small"
          value={store.homeStore.selectedSourceId ?? ""}
          label={t("sources.source")}
          onChange={handleSourceChange}
          sx={{ minWidth: 180 }}
        >
          {store.sources.map((source) => (
            <MenuItem value={source.id} key={source.id}>
              {source.name}
            </MenuItem>
          ))}
        </TextField>
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
            aria-label={hiddenProjectsButtonLabel}
            title={hiddenProjectsButtonLabel}
            size="small"
            onClick={handleToggleHiddenProjects}
            disabled={hiddenProjectCount === 0}
          >
            {store.homeStore.showHiddenProjects ? (
              <VisibilityOffOutlinedIcon fontSize="small" />
            ) : (
              <VisibilityOutlinedIcon fontSize="small" />
            )}
          </IconButton>
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
            {visibleProjects.map((project) => {
              const source = project.sourceId === null ? null : sourceById.get(project.sourceId) ?? null;

              return (
                <HomeProjectListItem
                  key={project.id}
                  project={project}
                  sourceName={source === null ? null : source.name}
                  sourceColor={source === null ? null : source.settings.color}
                  onOpen={handleOpenRecent}
                  onSetHidden={handleSetProjectHidden}
                />
              );
            })}
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
