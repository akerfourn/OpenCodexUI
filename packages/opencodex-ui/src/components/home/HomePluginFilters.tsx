import { MenuItem, Stack, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexSource } from "@open-codex-ui/opencodex-protocol";

import type {
  PluginInstallFilter,
  PluginsStore
} from "../../stores/app/PluginsStore";

type HomePluginFiltersProps = {
  store: PluginsStore;
  sources: OpenCodexSource[];
  canUseSelectedSource: boolean;
};

/** Renders source, search, install-state, and bounded category controls. */
export function HomePluginFilters({
  store,
  sources,
  canUseSelectedSource
}: HomePluginFiltersProps) {
  const { t } = useTranslation();

  function handleSourceChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setSelectedSourceId(event.target.value);
  }

  function handleSearchChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setSearchTerm(event.target.value);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      void store.loadCatalog();
    }
  }

  function handleCategoryChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setSelectedCategory(event.target.value);
  }

  function handleInstallFilterChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    store.setInstallFilter(event.target.value as PluginInstallFilter);
  }

  return (
    <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
      <TextField
        select
        size="small"
        label={t("plugins.source")}
        value={store.selectedSourceId ?? ""}
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
        value={store.searchTerm}
        disabled={!canUseSelectedSource}
        fullWidth
        onChange={handleSearchChange}
        onKeyDown={handleSearchKeyDown}
      />
      <TextField
        select
        size="small"
        label={t("plugins.filter")}
        value={store.installFilter}
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
        value={store.selectedCategory}
        disabled={store.categories.length === 0}
        sx={{ minWidth: 180 }}
        onChange={handleCategoryChange}
      >
        <MenuItem value="">{t("plugins.categories.all")}</MenuItem>
        {store.categories.map((category) => (
          <MenuItem key={category} value={category}>
            {category}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

export const HomePluginFiltersX = observer(HomePluginFilters);
