/**
 * Renders the experimental Codex plugin marketplace.
 */
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
  IconButton,
  Tooltip
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { PluginInstallFilter } from "../../stores/PluginsStore";
import type { RootStore } from "../../stores/RootStore";
import { HomePluginDetailDialogX } from "./HomePluginDetailDialog";
import { HomePluginListItem } from "./HomePluginListItem";

type HomePluginsViewProps = {
  store: RootStore;
};

/**
 * Renders Home plugin management.
 *
 * @param props Component props.
 * @returns Rendered plugin view.
 */
export function HomePluginsView({ store }: HomePluginsViewProps) {
  const { t } = useTranslation();
  const pluginsStore = store.pluginsStore;
  const sources = store.sourcesStore.sources;

  useEffect(() => {
    pluginsStore.selectDefaultSource(sources, store.appStore.settings.defaultSourceId);
  }, [pluginsStore, sources, store.appStore.settings.defaultSourceId]);

  function handleSourceChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    pluginsStore.setSelectedSourceId(event.target.value);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    pluginsStore.setSearchTerm(event.target.value);
  }

  function handleCategoryChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    pluginsStore.setSelectedCategory(event.target.value);
  }

  function handleInstallFilterChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    pluginsStore.setInstallFilter(event.target.value as PluginInstallFilter);
  }

  function handleRefresh(): void {
    void pluginsStore.load();
  }

  const hasSource = pluginsStore.selectedSourceId !== null;
  const selectedSourceValue = pluginsStore.selectedSourceId ?? "";
  const selectedSource = store.sourcesStore.findSource(pluginsStore.selectedSourceId);
  const isSelectedSourceReady = selectedSource?.codex.status === "ready";
  const canUseSelectedSource = hasSource && isSelectedSourceReady;

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
        <Tooltip title={t("plugins.refresh")}>
          <span>
            <IconButton
              aria-label={t("plugins.refresh")}
              disabled={!canUseSelectedSource || pluginsStore.isLoading}
              onClick={handleRefresh}
            >
              <RefreshOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Alert severity="info">{t("plugins.experimentalNotice")}</Alert>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          select
          size="small"
          label={t("plugins.source")}
          value={selectedSourceValue}
          disabled={sources.length === 0}
          sx={{ minWidth: 220 }}
          onChange={handleSourceChange}
        >
          {sources.map((source) => (
            <MenuItem key={source.id} value={source.id}>
              {source.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label={t("plugins.search")}
          value={pluginsStore.searchTerm}
          fullWidth
          onChange={handleSearchChange}
        />
        <TextField
          select
          size="small"
          label={t("plugins.filter")}
          value={pluginsStore.installFilter}
          sx={{ minWidth: 160 }}
          onChange={handleInstallFilterChange}
        >
          <MenuItem value="all">{t("plugins.filters.all")}</MenuItem>
          <MenuItem value="installed">{t("plugins.filters.installed")}</MenuItem>
          <MenuItem value="available">{t("plugins.filters.available")}</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label={t("plugins.category")}
          value={pluginsStore.selectedCategory}
          sx={{ minWidth: 180 }}
          onChange={handleCategoryChange}
        >
          <MenuItem value="">{t("plugins.categories.all")}</MenuItem>
          {pluginsStore.categories.map((category) => (
            <MenuItem key={category} value={category}>
              {category}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

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

      {canUseSelectedSource && pluginsStore.visiblePlugins.length === 0 && !pluginsStore.isLoading ? (
        <Typography variant="body2" color="text.secondary">
          {t("plugins.empty")}
        </Typography>
      ) : null}

      {canUseSelectedSource ? (
        <Stack spacing={1}>
          {pluginsStore.visiblePlugins.map((plugin) => (
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

      <HomePluginDetailDialogX store={pluginsStore} />
    </Stack>
  );
}

export const HomePluginsViewX = observer(HomePluginsView);
