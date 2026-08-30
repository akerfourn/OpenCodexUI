/**
 * Renders the blocking application-shutdown status overlay.
 */
import { Backdrop, CircularProgress, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type AppShutdownOverlayProps = {
  open: boolean;
};

/**
 * Covers the application while native services are being released.
 *
 * @param props Component props.
 * @returns Shutdown status overlay.
 */
export function AppShutdownOverlay({ open }: AppShutdownOverlayProps) {
  const { t } = useTranslation();

  return (
    <Backdrop
      open={open}
      sx={(theme) => ({
        backgroundColor: "rgba(0, 0, 0, 0.82)",
        color: theme.palette.common.white,
        zIndex: theme.zIndex.modal + 100
      })}
    >
      <Stack
        aria-busy="true"
        aria-live="polite"
        role="status"
        spacing={2}
        sx={{ alignItems: "center", maxWidth: 440, px: 4, textAlign: "center" }}
      >
        <CircularProgress color="inherit" size={42} />
        <Typography component="p" variant="h6">
          {t("app.shutdown.title")}
        </Typography>
        <Typography color="inherit" component="p" variant="body2">
          {t("app.shutdown.detail")}
        </Typography>
      </Stack>
    </Backdrop>
  );
}
