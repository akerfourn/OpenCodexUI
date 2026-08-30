/** Renders bounded, explicit plugin discovery for one Codex source. */
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { HomePluginDetailDialogX } from "./HomePluginDetailDialog";
import { HomePluginFiltersX } from "./HomePluginFilters";
import { HomePluginListItem } from "./HomePluginListItem";

type HomePluginsViewProps = {
  store: RootStore;
};

/** Renders Home plugin management without mounting the complete remote catalog. */
export function HomePluginsView({ store }: HomePluginsViewProps) {
  const { t } = useTranslation();
  const pluginsStore = store.pluginsStore;
  const sources = store.sourcesStore.sources;
  const defaultSourceId = store.appStore.settingsStore.settings.defaultSourceId;
  const selectedSource = store.sourcesStore.findSource(pluginsStore.selectedSourceId);
  const selectedSourceStatus = selectedSource?.codex.status;

  useEffect(() => {
    pluginsStore.selectDefaultSource(sources, defaultSourceId);
    void pluginsStore.ensureInstalledLoaded();
  }, [pluginsStore, sources, defaultSourceId, selectedSourceStatus]);

  function handleLoadCatalog(): void {
    void pluginsStore.loadCatalog();
  }

  function handleLoadMore(): void {
    void pluginsStore.loadMoreCatalogPlugins();
  }

  function handleRefreshCatalog(): void {
    void pluginsStore.refreshCatalog();
  }

  const hasSource = pluginsStore.selectedSourceId !== null;
  const isSelectedSourceReady = selectedSourceStatus === "ready";
  const canUseSelectedSource = hasSource && isSelectedSourceReady;
  const visiblePlugins = pluginsStore.visiblePlugins;
  const shouldShowEmptyState = canUseSelectedSource &&
    pluginsStore.hasLoadedInstalled &&
    !pluginsStore.isLoading &&
    visiblePlugins.length === 0 &&
    (pluginsStore.hasLoadedCatalog || pluginsStore.installFilter === "installed");

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Box sx={{ alignItems: "flex-start", display: "flex", gap: 2 }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <Typography variant="h5" component="h2">
            {t("plugins.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("plugins.description")}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          disabled={!canUseSelectedSource || pluginsStore.isLoading}
          onClick={handleRefreshCatalog}
        >
          {t("plugins.refreshCatalog")}
        </Button>
      </Box>

      <Alert severity="info">{t("plugins.experimentalNotice")}</Alert>

      <HomePluginFiltersX
        store={pluginsStore}
        sources={sources}
        canUseSelectedSource={canUseSelectedSource}
      />

      {pluginsStore.isLoading ? <LinearProgress /> : null}

      {pluginsStore.errorMessage !== null ? (
        <Alert severity="error">{pluginsStore.errorMessage}</Alert>
      ) : null}

      {hasSource && !isSelectedSourceReady ? (
        <Alert severity="warning">{t("plugins.sourceUnavailable")}</Alert>
      ) : null}

      {pluginsStore.loadErrors.map((error) => (
        <Alert key={error} severity="warning">{error}</Alert>
      ))}

      {!hasSource ? (
        <Typography variant="body2" color="text.secondary">
          {t("plugins.noSource")}
        </Typography>
      ) : null}

      {canUseSelectedSource && !pluginsStore.hasLoadedCatalog ? (
        <Alert
          severity="info"
          action={(
            <Button
              color="inherit"
              size="small"
              startIcon={<SearchOutlinedIcon />}
              disabled={pluginsStore.isLoading}
              onClick={handleLoadCatalog}
            >
              {t("plugins.loadCatalog")}
            </Button>
          )}
        >
          {t("plugins.catalogNotLoaded")}
        </Alert>
      ) : null}

      {shouldShowEmptyState ? (
        <Typography variant="body2" color="text.secondary">
          {t("plugins.empty")}
        </Typography>
      ) : null}

      {canUseSelectedSource && visiblePlugins.length > 0 ? (
        <Stack spacing={1}>
          {visiblePlugins.map((plugin) => (
            <HomePluginListItem
              key={`${plugin.marketplaceName}:${plugin.name}:${plugin.id}`}
              plugin={plugin}
              isBusy={pluginsStore.isPluginBusy(plugin.id)}
              onOpen={pluginsStore.openPlugin}
              onInstall={pluginsStore.installPlugin}
              onUninstall={pluginsStore.uninstallPlugin}
            />
          ))}
        </Stack>
      ) : null}

      {canUseSelectedSource && pluginsStore.hasMoreCatalogPlugins ? (
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button disabled={pluginsStore.isLoadingCatalog} onClick={handleLoadMore}>
            {t("plugins.loadMore")}
          </Button>
        </Box>
      ) : null}

      {pluginsStore.hasReachedCatalogDisplayLimit ? (
        <Alert severity="info">{t("plugins.refineSearch")}</Alert>
      ) : null}

      <HomePluginDetailDialogX store={pluginsStore} />
    </Stack>
  );
}

export const HomePluginsViewX = observer(HomePluginsView);
