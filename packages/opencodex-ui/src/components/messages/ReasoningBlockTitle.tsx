import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircularProgress, Typography } from "@mui/material";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";

type ReasoningBlockKind = "reasoning" | "activity" | "mixed";

type ReasoningBlockTitleProps = {
  kind: ReasoningBlockKind;
  isRunning: boolean;
  startedAt: string | null;
  fallbackStartedAt: string | null;
  durationMs: number | null;
  entryCount: number;
};

/**
 * Renders the compact reasoning header and owns its running-duration clock.
 *
 * Keeping the one-second state here prevents the whole reasoning timeline from
 * rerendering just to update the elapsed time label.
 */
export function ReasoningBlockTitle({
  kind,
  isRunning,
  startedAt,
  fallbackStartedAt,
  durationMs,
  entryCount
}: ReasoningBlockTitleProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const runningStartedAt = startedAt ?? fallbackStartedAt;
  const displayedDurationMs = isRunning
    ? Math.max(0, now - readStartedAtTime(runningStartedAt))
    : durationMs;
  const label = isRunning
    ? t("reasoningBlock.active", {
      duration: formatDuration(displayedDurationMs) ?? "0 s"
    })
    : formatBlockLabel(kind, durationMs, t);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning]);

  return (
    <>
      {isRunning ? (
        <CircularProgress size={16} thickness={5} />
      ) : (
        <PsychologyOutlinedIcon fontSize="small" />
      )}
      <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
        {label}
      </Typography>
      {entryCount > 0 ? (
        <Typography variant="caption" color="text.secondary">
          ({entryCount})
        </Typography>
      ) : null}
    </>
  );
}

export const ReasoningBlockTitleM = memo(ReasoningBlockTitle);

/** Resolves the generic translated label for a reasoning block. */
function formatBlockLabel(
  kind: ReasoningBlockKind,
  durationMs: number | null,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  const baseLabel = kind === "reasoning"
    ? translate("reasoningBlock.reasoning")
    : kind === "mixed"
      ? translate("reasoningBlock.mixed")
      : translate("reasoningBlock.activity");
  const durationLabel = formatDuration(durationMs);

  return durationLabel === null ? baseLabel : `${baseLabel} (${durationLabel})`;
}

/** Formats a duration using the same compact units as the original header. */
function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const segments: string[] = [];

  if (hours > 0) {
    segments.push(`${hours} h`);
  }

  if (hours > 0 || minutes > 0) {
    segments.push(`${minutes} min`);
  }

  segments.push(`${seconds} s`);
  return segments.join(" ");
}

/** Converts an optional ISO timestamp into a comparable epoch value. */
function readStartedAtTime(value: string | null): number {
  if (value === null) {
    return Date.now();
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? Date.now() : time;
}
