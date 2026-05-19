/**
 * Renders the context-window usage indicator for a chat thread.
 */
import { Box, CircularProgress, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexThreadTokenUsage } from "@open-codex-ui/opencodex-protocol";

type ThreadContextUsageIndicatorProps = {
  usage: OpenCodexThreadTokenUsage | null;
};

/**
 * Renders a compact circular context usage progress bar.
 *
 * @param props Component props.
 *
 * @returns Rendered indicator, or `null` when usage is unavailable.
 */
export function ThreadContextUsageIndicator({ usage }: ThreadContextUsageIndicatorProps) {
  const { t } = useTranslation();

  if (usage === null || usage.usedPercent === null || usage.modelContextWindow === null) {
    return null;
  }

  const contextWindowTokens = usage.contextWindowTokens ?? usage.last.totalTokens;
  const percent = Math.round(usage.usedPercent);
  const tooltip = t("header.contextUsageTooltip", {
    used: formatTokenCount(contextWindowTokens),
    max: formatTokenCount(usage.modelContextWindow),
    percent,
    total: formatTokenCount(usage.total.totalTokens)
  });

  return (
    <Tooltip title={tooltip}>
      <Box
        aria-label={tooltip}
        className="thread-context-usage"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <CircularProgress
          className="thread-context-usage-track"
          variant="determinate"
          value={100}
          size={30}
          thickness={4}
        />
        <CircularProgress
          className="thread-context-usage-value"
          variant="determinate"
          value={usage.usedPercent}
          size={30}
          thickness={4}
        />
        <Typography
          className="thread-context-usage-label"
          component="span"
          variant="caption"
        >
          {percent}
        </Typography>
      </Box>
    </Tooltip>
  );
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0
  }).format(value);
}
