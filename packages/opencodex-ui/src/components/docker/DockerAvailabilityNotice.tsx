import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexDockerUnavailableReason } from "@open-codex-ui/opencodex-protocol";

interface DockerAvailabilityNoticeProps {
  reason: OpenCodexDockerUnavailableReason;
  scope: "host" | "source";
  isLoading: boolean;
  onRefresh(): void;
}

/** Presents optional Docker setup state compactly, with explanations and an explicit recheck. */
export function DockerAvailabilityNotice({ reason, scope, isLoading, onRefresh }: DockerAvailabilityNoticeProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const titleId = useId();
  const title = t(`docker.availability.${reason}.title`);
  let pollingExplanation = null;
  if (scope === "source") {
    pollingExplanation = <Typography variant="body2">{t("docker.availability.pollingPaused")}</Typography>;
  }

  /** Opens guidance without replaying an error or starting a process. */
  function handleOpen(): void {
    setIsOpen(true);
  }

  /** Dismisses guidance while preserving the module's visible state. */
  function handleClose(): void {
    setIsOpen(false);
  }

  return (
    <>
      <Chip size="small" variant="outlined" color="warning" icon={<WarningAmberOutlinedIcon />}
        sx={{ alignSelf: "flex-start", maxWidth: "100%" }} aria-haspopup="dialog"
        label={title} onClick={handleOpen} aria-label={t("docker.availability.explain", { status: title })} />
      <Dialog open={isOpen} onClose={handleClose} aria-labelledby={titleId} maxWidth="sm" fullWidth>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography variant="body2">{t(`docker.availability.${reason}.description`)}</Typography>
            <Typography variant="body2" color="text.secondary">{t(`docker.availability.${scope}`)}</Typography>
            {pollingExplanation}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{t("docker.availability.close")}</Button>
          <Button onClick={onRefresh} disabled={isLoading} variant="contained">{t("docker.availability.recheck")}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
