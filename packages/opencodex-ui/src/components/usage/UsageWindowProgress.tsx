import { Box, LinearProgress } from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface UsageWindowProgressProps {
  label: string;
  remainingPercent: number;
  windowDurationMins: number | null;
  resetsAt: string | null;
  color: "primary" | "secondary" | "warning" | "error";
}

/** Shows the remaining quota and the target for an even pace in the current window. */
export function UsageWindowProgress({
  label,
  remainingPercent,
  windowDurationMins,
  resetsAt,
  color
}: UsageWindowProgressProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const target = readRemainingTarget(windowDurationMins, resetsAt, now);
  const hasTarget = target !== null;

  useEffect(() => {
    if (!hasTarget) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [hasTarget]);

  useEffect(() => {
    setNow(Date.now());
  }, [resetsAt, windowDurationMins]);

  let marker = null;
  let valueText: string | undefined;
  if (target !== null) {
    const isMarkerOnFill = target < remainingPercent;
    valueText = t("usage.paceValue", {
      remainingPercent: Math.round(remainingPercent),
      targetPercent: Math.round(target)
    });
    marker = (
      <Box
        aria-hidden="true"
        style={{ insetInlineStart: `clamp(1px, ${target}%, calc(100% - 1px))` }}
        sx={{
          position: "absolute",
          insetBlock: "1px",
          width: "1px",
          bgcolor: isMarkerOnFill ? "common.white" : (theme) =>
            theme.palette.mode === "dark" ? "#fdba74" : "#9a3412",
          opacity: isMarkerOnFill ? 0.7 : 0.85,
          pointerEvents: "none"
        }}
      />
    );
  }

  return (
    <Box sx={{ position: "relative", flex: "1 1 auto", minWidth: 4 }}>
      <LinearProgress
        aria-label={label}
        aria-valuetext={valueText}
        variant="determinate"
        value={remainingPercent}
        color={color}
        sx={{ height: 8, borderRadius: 999 }}
      />
      {marker}
    </Box>
  );
}

/** Calculates the target remaining quota from the time left in a live window. */
function readRemainingTarget(
  windowDurationMins: number | null,
  resetsAt: string | null,
  now: number
): number | null {
  if (windowDurationMins === null || resetsAt === null) {
    return null;
  }

  const duration = windowDurationMins * 60_000;
  const timeLeft = Date.parse(resetsAt) - now;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(timeLeft) || timeLeft <= 0) {
    return null;
  }

  return Math.min(100, (timeLeft / duration) * 100);
}
