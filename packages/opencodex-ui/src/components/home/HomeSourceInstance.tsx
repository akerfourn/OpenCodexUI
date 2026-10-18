import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { Box, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SourceInstancesStore } from "../../stores/app/SourceInstancesStore";
import { SourceInstanceControlDialogX } from "./SourceInstanceControlDialog";

interface HomeSourceInstanceProps {
  sourceId: string;
  sourceName: string;
  instances: SourceInstancesStore;
}

/** Shows the owned process state independently of executable detection, with explicit lifecycle controls. */
export function HomeSourceInstance({ sourceId, sourceName, instances }: HomeSourceInstanceProps) {
  const { t } = useTranslation();
  const [action, setAction] = useState<"stop" | "restart" | null>(null);
  const snapshot = instances.states.get(sourceId);
  const phase = snapshot?.phase;
  const isActive = snapshot?.isActive === true;
  const statusHint = snapshot?.manuallyStopped === true ? t("sourceInstances.manualStop") : "";
  const pulseAnimation = isActive ? "sourceInstancePulse 1.4s ease-in-out infinite" : "none";
  const isStopped = phase === "stopped";
  const isDisabled = phase === undefined || phase === "stopping" || phase === "updating"
    || (instances.pending.has(sourceId) && phase !== "starting");
  const error = instances.errors.get(sourceId) ?? snapshot?.error ?? instances.loadError;
  let label = t("sourceInstances.unknown");
  let color = "text.disabled";
  if (phase !== undefined) label = t(`sourceInstances.${phase}`);
  if (phase === "ready") color = "success.main";
  if (phase === "starting" || phase === "stopping" || phase === "updating") color = "warning.main";
  if (phase === "error") color = "error.main";
  if (isActive) label = t("sourceInstances.active");

  /** Starts this source only after an explicit user action. */
  function handleStart(): void {
    void instances.control(sourceId, "start");
  }
  /** Opens the confirmation without interrupting any work. */
  function handleStop(): void {
    setAction("stop");
  }
  /** Opens the restart confirmation, retaining the same source identity. */
  function handleRestart(): void {
    setAction("restart");
  }
  /** Discards the dialog and its force acknowledgement. */
  function handleClose(): void {
    setAction(null);
  }

  let primaryControl = (
    <Tooltip title={t("sourceInstances.stop")}>
      <span><IconButton size="small" disabled={isDisabled} aria-label={t("sourceInstances.stop")} onClick={handleStop}>
        <StopCircleOutlinedIcon fontSize="small" />
      </IconButton></span>
    </Tooltip>
  );
  if (isStopped) primaryControl = (
    <Tooltip title={t("sourceInstances.start")}>
      <span><IconButton size="small" disabled={isDisabled} aria-label={t("sourceInstances.start")} onClick={handleStart}>
        <PlayArrowOutlinedIcon fontSize="small" />
      </IconButton></span>
    </Tooltip>
  );
  let dialog = null;
  if (action !== null && snapshot !== undefined) dialog = (
    <SourceInstanceControlDialogX sourceName={sourceName} sourceId={sourceId}
      instances={instances} action={action} onClose={handleClose} />
  );
  let errorContent = null;
  if (error !== undefined && error !== null) errorContent = (
    <Typography variant="caption" color="error.main" sx={{ overflowWrap: "anywhere" }}>{error}</Typography>
  );

  return (
    <Stack spacing={0.25}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Tooltip title={statusHint}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color }} role="status">
            <Box component="span" aria-hidden="true" data-active={isActive} sx={{
              backgroundColor: "currentColor", width: 7, height: 7, borderRadius: "50%",
              animation: pulseAnimation,
              "@keyframes sourceInstancePulse": { "0%, 100%": { opacity: 1 }, "50%": { opacity: 0.3 } },
              "@media (prefers-reduced-motion: reduce)": { animation: "none" }
            }} />
            <Typography variant="caption">{label}</Typography>
          </Stack>
        </Tooltip>
        {primaryControl}
        <Tooltip title={t("sourceInstances.restart")}>
          <span><IconButton size="small" disabled={isDisabled || isStopped}
            aria-label={t("sourceInstances.restart")} onClick={handleRestart}>
            <RestartAltOutlinedIcon fontSize="small" />
          </IconButton></span>
        </Tooltip>
      </Stack>
      {errorContent}
      {dialog}
    </Stack>
  );
}

export const HomeSourceInstanceX = observer(HomeSourceInstance);
