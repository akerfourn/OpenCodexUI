/**
 * Renders one compact usage progress bar.
 */
import { Box, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexUsageWindow } from "@open-codex-ui/opencodex-protocol";

import { UsageWindowProgress } from "./UsageWindowProgress";

type UsageWindowBarProps = {
  window: OpenCodexUsageWindow;
};

/**
 * Renders a single usage window.
 *
 * @param props Component props.
 * @returns Rendered usage window bar.
 */
export function UsageWindowBar({ window }: UsageWindowBarProps) {
  const { t } = useTranslation();
  const label = t(`usage.labels.${window.label}`);
  const remainingPercent = Math.round(window.remainingPercent);

  return (
    <Box className="usage-window-bar">
      <Typography
        variant="caption"
        sx={{
          flex: "0 0 auto",
          minWidth: 32,
          color: "text.secondary",
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1,
          textAlign: "right"
        }}
      >
        {label}
      </Typography>
      <UsageWindowProgress
        label={label}
        remainingPercent={window.remainingPercent}
        windowDurationMins={window.windowDurationMins}
        resetsAt={window.resetsAt}
        color={readProgressColor(window.remainingPercent)}
      />
      <Typography
        variant="caption"
        sx={{
          flex: "0 0 auto",
          minWidth: 30,
          color: "text.secondary",
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1,
          textAlign: "right"
        }}
      >
        {remainingPercent}%
      </Typography>
    </Box>
  );
}

export const UsageWindowBarX = observer(UsageWindowBar);

/** Highlights windows with little quota remaining. */
function readProgressColor(remainingPercent: number): "primary" | "warning" | "error" {
  if (remainingPercent <= 10) {
    return "error";
  }

  if (remainingPercent <= 30) {
    return "warning";
  }

  return "primary";
}
