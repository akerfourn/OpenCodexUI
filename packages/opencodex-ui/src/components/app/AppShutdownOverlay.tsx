/**
 * Renders focused progress feedback during installation or application shutdown.
 */
import { Backdrop, CircularProgress, Modal, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type AppShutdownOverlayProps = {
  open: boolean;
  mode?: "shutdown" | "update";
};

/**
 * Blocks interaction while an update is installed or native services are released.
 *
 * @param props Component props.
 * @returns Shutdown status overlay.
 */
export function AppShutdownOverlay({ open, mode = "shutdown" }: AppShutdownOverlayProps) {
  const { t } = useTranslation();
  const title = mode === "update" ? t("updates.installing") : t("shutdown.title");
  const detail = mode === "update" ? t("updates.installingDetail") : t("shutdown.detail");

  return (
    <Modal
      open={open}
      hideBackdrop
      disablePortal
      sx={(theme) => ({ zIndex: theme.zIndex.modal + 100 })}
    >
      <Backdrop
        open={open}
        tabIndex={-1}
        aria-hidden={false}
        aria-label={title}
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
            {title}
          </Typography>
          <Typography color="inherit" component="p" variant="body2">
            {detail}
          </Typography>
        </Stack>
      </Backdrop>
    </Modal>
  );
}
