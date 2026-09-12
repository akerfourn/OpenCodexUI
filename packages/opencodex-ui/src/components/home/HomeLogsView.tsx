/**
 * Renders persisted application logs on the Home tab.
 */
import CleaningServicesOutlinedIcon from "@mui/icons-material/CleaningServicesOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  Box,
  Button,
  IconButton,
  LinearProgress,
  List,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexLogEntry } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { HomeLogCleanupDialogX } from "./HomeLogCleanupDialog";
import { HomeLogDetailsDialog } from "./HomeLogDetailsDialog";
import { HomeLogListItemX } from "./HomeLogListItem";
import { HomeLogPolicyDialogX } from "./HomeLogPolicyDialog";
import { HomeLogTypeFilterX } from "./HomeLogTypeFilter";

type HomeLogsViewProps = {
  store: RootStore;
};

/**
 * Renders the Home logs section.
 *
 * @param props Component props.
 *
 * @returns Rendered logs view.
 */
export function HomeLogsView({ store }: HomeLogsViewProps) {
  const { t } = useTranslation();
  const logsStore = store.logsStore;
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [selectedLog, setSelectedLog] = useState<OpenCodexLogEntry | null>(null);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const visibleLogs = logsStore.visibleLogs;

  useEffect(() => {
    if (logsStore.logs.length === 0 && !logsStore.isLoading) {
      void logsStore.loadLatest();
    }
  }, [logsStore]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (target === null) {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      const firstEntry = entries[0];

      if (firstEntry?.isIntersecting === true) {
        void logsStore.loadMore();
      }
    });

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [logsStore]);

  function handleOpenCleanup(): void {
    logsStore.openCleanupDialog();
  }

  /** Opens the log retention policy editor without changing persisted settings. */
  function handleOpenPolicySettings(): void {
    setPolicyDialogOpen(true);
  }

  /** Discards the current log retention policy draft. */
  function handleClosePolicySettings(): void {
    setPolicyDialogOpen(false);
  }

  function handleDeleteLog(logId: string): void {
    logsStore.deleteLog(logId);
  }

  function handleOpenLog(log: OpenCodexLogEntry): void {
    setSelectedLog(log);
  }

  function handleCloseDetails(): void {
    setSelectedLog(null);
  }

  function handleLoadMore(): void {
    void logsStore.loadMore();
  }

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Box sx={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h5" component="h2" sx={{ flex: "1 1 auto" }}>
          {t("logs.title")}
        </Typography>
        <HomeLogTypeFilterX store={logsStore} />
        <Tooltip title={t("logs.cleanup")}>
          <IconButton aria-label={t("logs.cleanup")} color="primary" onClick={handleOpenCleanup}>
            <CleaningServicesOutlinedIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("logs.policySettings")}>
          <IconButton
            aria-label={t("logs.policySettings")}
            color="primary"
            onClick={handleOpenPolicySettings}
          >
            <SettingsOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {logsStore.isLoading ? <LinearProgress /> : null}

      {visibleLogs.length === 0 && !logsStore.isLoading ? (
        <Typography variant="body2" color="text.secondary">
          {logsStore.logs.length === 0 ? t("logs.empty") : t("logs.noMatching")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {visibleLogs.map((log) => (
            <HomeLogListItemX
              key={log.id}
              log={log}
              onDelete={handleDeleteLog}
              onOpen={handleOpenLog}
            />
          ))}
        </List>
      )}

      {logsStore.hasMore ? (
        <Box ref={loadMoreRef} sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <Button type="button" onClick={handleLoadMore} disabled={logsStore.isLoading}>
            {t("logs.loadMore")}
          </Button>
        </Box>
      ) : null}

      <HomeLogDetailsDialog log={selectedLog} onClose={handleCloseDetails} />
      <HomeLogCleanupDialogX store={logsStore} />
      <HomeLogPolicyDialogX
        store={store.appStore.settingsStore}
        open={policyDialogOpen}
        onClose={handleClosePolicySettings}
      />
    </Stack>
  );
}

export const HomeLogsViewX = observer(HomeLogsView);
