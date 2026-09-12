/** Renders application update preferences and explicit update actions. */
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  LinearProgress,
  Stack,
  Switch,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";

type HomeAppUpdateSettingsProps = {
  store: RootStore;
};

/** Provides update-channel preferences and manual update controls. */
function HomeAppUpdateSettings({ store }: HomeAppUpdateSettingsProps) {
  const { t } = useTranslation();
  const settingsStore = store.appStore.settingsStore;
  const updateStore = store.appUpdateStore;
  const state = updateStore.state;
  const isChecking = state.status === "checking";
  const isDownloading = state.status === "downloading";
  const hasDeterminateProgress = state.progress !== null && state.progress.total > 0;

  function handlePrereleaseChange(event: ChangeEvent<HTMLInputElement>): void {
    settingsStore.setAllowPrereleaseUpdates(event.target.checked);
  }

  function handleCheck(): void {
    void updateStore.check();
  }

  function handleDownload(): void {
    void updateStore.download();
  }

  function handleInstall(): void {
    updateStore.install();
  }

  const action = state.status === "available" ? (
    <Button
      type="button"
      variant="outlined"
      size="small"
      startIcon={<DownloadOutlinedIcon />}
      onClick={handleDownload}
    >
      {t("settings.appUpdatesDownload")}
    </Button>
  ) : state.status === "downloaded" ? (
    <Button
      type="button"
      variant="contained"
      size="small"
      startIcon={<SystemUpdateAltOutlinedIcon />}
      onClick={handleInstall}
    >
      {t("settings.appUpdatesInstall")}
    </Button>
  ) : null;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        backgroundColor: "action.hover",
        px: 1.5,
        py: 1.25
      }}
    >
      <Stack spacing={1}>
        <Typography variant="subtitle1">
          {t("settings.appUpdates")}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
          {t("settings.appUpdatesDescription")}
        </Typography>
        <Typography variant="body2">
          {t("settings.appUpdatesCurrentVersion", {
            version: state.currentVersion || store.appStore.appVersion || "?"
          })}
        </Typography>
        <FormControlLabel
          sx={{ alignItems: "flex-start", m: 0 }}
          control={(
            <Switch
              checked={settingsStore.settings.allowPrereleaseUpdates === true}
              onChange={handlePrereleaseChange}
              sx={{ mt: -0.5 }}
            />
          )}
          label={(
            <Stack spacing={0.25}>
              <Typography variant="body1">
                {t("settings.appUpdatesIncludePrerelease")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                {t("settings.appUpdatesIncludePrereleaseDescription")}
              </Typography>
            </Stack>
          )}
        />
        {!state.isSupported ? (
          <Alert severity="info" variant="outlined">
            {t("settings.appUpdatesUnsupported")}
          </Alert>
        ) : null}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="outlined"
            size="small"
            startIcon={<RefreshOutlinedIcon />}
            disabled={!state.isSupported || isChecking || isDownloading}
            onClick={handleCheck}
          >
            {isChecking ? t("settings.appUpdatesChecking") : t("settings.appUpdatesCheck")}
          </Button>
          {action}
        </Stack>
        {isDownloading ? (
          <LinearProgress
            variant={hasDeterminateProgress ? "determinate" : "indeterminate"}
            value={hasDeterminateProgress ? state.progress?.percent ?? 0 : undefined}
          />
        ) : null}
        {renderUpdateStatus(t, state)}
      </Stack>
    </Box>
  );
}

/** Renders the compact status explanation below update actions. */
function renderUpdateStatus(
  t: (key: string, options?: Record<string, unknown>) => string,
  state: RootStore["appUpdateStore"]["state"]
) {
  if (state.status === "available") {
    return (
      <Typography variant="caption" color="info.main">
        {t("settings.appUpdatesAvailable", { version: state.availableVersion ?? "" })}
      </Typography>
    );
  }

  if (state.status === "downloaded") {
    return (
      <Typography variant="caption" color="success.main">
        {t("settings.appUpdatesDownloaded", { version: state.availableVersion ?? "" })}
      </Typography>
    );
  }

  if (state.status === "error") {
    return (
      <Typography variant="caption" color="error.main">
        {t("settings.appUpdatesError", { message: state.errorMessage ?? "" })}
      </Typography>
    );
  }

  if (state.status === "not-available") {
    return (
      <Typography variant="caption" color="text.secondary">
        {t("settings.appUpdatesNotAvailable")}
      </Typography>
    );
  }

  return null;
}

export const HomeAppUpdateSettingsX = observer(HomeAppUpdateSettings);
