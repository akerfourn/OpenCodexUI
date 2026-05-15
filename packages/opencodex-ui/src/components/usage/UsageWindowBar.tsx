/**
 * Renders one compact usage progress bar.
 */
import { Box, LinearProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexUsageWindow } from "@open-codex-ui/opencodex-protocol";

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
      <LinearProgress
        variant="determinate"
        value={window.remainingPercent}
        color={readProgressColor(window.remainingPercent)}
        sx={{
          flex: "1 1 auto",
          height: 10,
          borderRadius: 999
        }}
      />
      <Typography
        variant="caption"
        sx={{
          flex: "0 0 auto",
          minWidth: 78,
          color: "text.secondary",
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1,
          textAlign: "right"
        }}
      >
        {label} ({remainingPercent}%)
      </Typography>
    </Box>
  );
}

function readProgressColor(remainingPercent: number): "primary" | "warning" | "error" {
  if (remainingPercent <= 10) {
    return "error";
  }

  if (remainingPercent <= 30) {
    return "warning";
  }

  return "primary";
}
