import { Box, IconButton, Tooltip } from "@mui/material";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import RedoIcon from "@mui/icons-material/Redo";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Compact toolbar disables execution commands outside their valid lifecycle states. */
export function DebugControls({ store }: { store: DebugStore }) {
  const { t } = useTranslation();
  const session = store.snapshot.session;
  const paused = session?.state === "paused";
  const running = session?.state === "running";
  let stopIcon = <StopIcon />;
  let stopLabel = t("debug.stop");
  if (session?.configuration.request === "attach") { stopIcon = <LinkOffIcon />; stopLabel = t("debug.disconnect"); }
  const actions = [
    { name: t("debug.continue"), icon: <PlayArrowIcon />, disabled: !paused || store.controlPending, run: () => store.control("continue") },
    { name: t("debug.pause"), icon: <PauseIcon />, disabled: !running || store.controlPending, run: () => store.control("pause") },
    { name: t("debug.next"), icon: <RedoIcon />, disabled: !paused || store.controlPending, run: () => store.control("next") },
    { name: t("debug.stepIn"), icon: <ArrowDownwardIcon />, disabled: !paused || store.controlPending, run: () => store.control("stepIn") },
    { name: t("debug.stepOut"), icon: <ArrowUpwardIcon />, disabled: !paused || store.controlPending, run: () => store.control("stepOut") },
    { name: stopLabel, icon: stopIcon, disabled: !store.active || session?.state === "stopping", run: () => store.stop() }
  ];
  return <Box sx={{ display: "flex", flexWrap: "wrap" }}>{actions.map(action =>
    <Tooltip key={action.name} title={action.name}><span><IconButton aria-label={action.name}
      disabled={action.disabled} onClick={() => void action.run()} size="small">{action.icon}</IconButton></span></Tooltip>
  )}</Box>;
}
export const DebugControlsX = observer(DebugControls);
