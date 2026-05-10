/**
 * Renders Codex source configuration on the Home tab.
 */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { HomeSourceBoxX } from "./HomeSourceBox";

type HomeSourcesViewProps = {
  store: RootStore;
};

/**
 * Renders the source management section.
 *
 * @param props Component props.
 * @returns Rendered sources view.
 */
export function HomeSourcesView({ store }: HomeSourcesViewProps) {
  const { t } = useTranslation();
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const appStore = store.appStore;
  const sourcesStore = store.sourcesStore;

  function handleCreateSource(): void {
    void sourcesStore.createSource().then((source) => {
      if (source !== null) {
        setEditingSourceId(source.id);
      }
    });
  }

  function handleSyncAllSources(): void {
    sourcesStore.syncAllSources();
  }

  function handleCloseEditor(): void {
    setEditingSourceId(null);
  }

  function handleEditSource(sourceId: string): void {
    setEditingSourceId(sourceId);
  }

  const sortedSources = [...sourcesStore.sources].sort((firstSource, secondSource) => {
    if (isDefaultSource(firstSource.id, appStore.settings.defaultSourceId)) {
      return -1;
    }

    if (isDefaultSource(secondSource.id, appStore.settings.defaultSourceId)) {
      return 1;
    }

    return firstSource.createdAt.localeCompare(secondSource.createdAt);
  });

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        <Box sx={{ flex: "1 1 auto" }}>
          <Typography variant="h5" component="h2">
            {t("sources.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("sources.description")}
          </Typography>
        </Box>
        <Tooltip title={t("sources.syncAll")}>
          <span>
            <IconButton
              type="button"
              aria-label={t("sources.syncAll")}
              disabled={sourcesStore.isSyncingAllSources || sourcesStore.sources.length === 0}
              onClick={handleSyncAllSources}
            >
              <SyncOutlinedIcon
                sx={{
                  animation: sourcesStore.isSyncingAllSources ? "source-sync-spin 1s linear infinite" : "none",
                  "@keyframes source-sync-spin": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(-360deg)" }
                  }
                }}
              />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("sources.add")}>
          <IconButton
            type="button"
            aria-label={t("sources.add")}
            onClick={handleCreateSource}
          >
            <AddOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {sortedSources.map((source) => (
        <HomeSourceBoxX
          key={source.id}
          source={source}
          store={store}
          isDefault={isDefaultSource(source.id, appStore.settings.defaultSourceId)}
          isEditing={source.id === editingSourceId}
          onEdit={handleEditSource}
          onCloseEdit={handleCloseEditor}
        />
      ))}
    </Stack>
  );
}

export const HomeSourcesViewX = observer(HomeSourcesView);

/**
 * Checks whether a source is the protected default source.
 *
 * @param sourceId Source identifier.
 * @param configuredDefaultSourceId Configured default source.
 * @returns `true` for the default source.
 */
function isDefaultSource(sourceId: string, configuredDefaultSourceId: string | null): boolean {
  return sourceId === configuredDefaultSourceId;
}
