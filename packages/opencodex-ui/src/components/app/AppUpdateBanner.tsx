/** Renders the non-blocking application update banner. */
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SystemUpdateAltOutlinedIcon from "@mui/icons-material/SystemUpdateAltOutlined";
import { Alert, Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { AppUpdateStore } from "../../stores/app/AppUpdateStore";

type AppUpdateBannerProps = {
  store: AppUpdateStore;
};

/** Shows available, downloading, downloaded, and failed update states. */
function AppUpdateBanner({ store }: AppUpdateBannerProps) {
  const { t } = useTranslation();
  const state = store.state;

  if (!state.isSupported || !shouldShowBanner(state.status)) {
    return null;
  }

  if (state.status === "available") {
    return (
      <Alert severity="info" icon={<SystemUpdateAltOutlinedIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2">
            {t("updates.available", { version: state.availableVersion ?? "" })}
          </Typography>
          <Button
            color="inherit"
            size="small"
            startIcon={<DownloadOutlinedIcon />}
            onClick={() => { void store.download(); }}
          >
            {t("updates.download")}
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (state.status === "downloading") {
    const progress = state.progress;
    const hasDeterminateProgress = progress !== null && progress.total > 0;

    return (
      <Alert severity="info" icon={<DownloadOutlinedIcon />}>
        <Box sx={{ minWidth: 0, width: "100%" }}>
          <Typography variant="body2">
            {t("updates.downloading", { version: state.availableVersion ?? "" })}
          </Typography>
          <LinearProgress
            variant={hasDeterminateProgress ? "determinate" : "indeterminate"}
            value={hasDeterminateProgress ? progress?.percent ?? 0 : undefined}
            sx={{ mt: 0.75, minWidth: 180 }}
          />
        </Box>
      </Alert>
    );
  }

  if (state.status === "downloaded") {
    return (
      <Alert severity="success" icon={<SystemUpdateAltOutlinedIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="body2">
            {t("updates.downloaded", { version: state.availableVersion ?? "" })}
          </Typography>
          <Button
            color="inherit"
            size="small"
            startIcon={<SystemUpdateAltOutlinedIcon />}
            onClick={() => store.install()}
          >
            {t("updates.install")}
          </Button>
        </Stack>
      </Alert>
    );
  }

  return (
    <Alert severity="error" icon={<ErrorOutlineOutlinedIcon />}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body2">
          {t("updates.error", { message: state.errorMessage ?? "" })}
        </Typography>
        <Button
          color="inherit"
          size="small"
          startIcon={<RefreshOutlinedIcon />}
          onClick={() => { void store.check(); }}
        >
          {t("updates.retry")}
        </Button>
      </Stack>
    </Alert>
  );
}

/** Limits the global banner to states that need user attention. */
function shouldShowBanner(status: AppUpdateStore["state"]["status"]): boolean {
  return status === "available"
    || status === "downloading"
    || status === "downloaded"
    || status === "error";
}

export const AppUpdateBannerX = observer(AppUpdateBanner);
