/**
 * Renders compact Codex usage progress bars.
 */
import { Stack, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexUsageWindow } from "@open-codex-ui/opencodex-protocol";

import type { UsageStore } from "../../stores/UsageStore";
import { UsageWindowBar } from "./UsageWindowBar";

type UsageLimitsWidgetProps = {
  store: UsageStore;
};

/**
 * Renders usage bars for short and weekly windows.
 *
 * @param props Component props.
 * @returns Rendered usage widget.
 */
export function UsageLimitsWidget({ store }: UsageLimitsWidgetProps) {
  const { t } = useTranslation();
  const usage = store.defaultUsage;

  useEffect(() => {
    void store.load();
  }, [store]);

  if (usage === null || store.isUnavailable) {
    return null;
  }

  const windows = [usage.primary, usage.secondary].filter(
    (window): window is OpenCodexUsageWindow => window !== null
  ).sort(compareUsageWindows);

  if (windows.length === 0) {
    return null;
  }

  const tooltip = windows.map((window) => {
    const label = t(`usage.labels.${window.label}`);

    return t("usage.tooltip", {
      label,
      usedPercent: Math.round(window.usedPercent),
      remainingPercent: Math.round(window.remainingPercent),
      reset: formatReset(window.resetsAt)
    });
  }).join("\n");

  return (
    <Tooltip
      title={tooltip}
      placement="top"
      arrow
      slotProps={{ tooltip: { sx: { whiteSpace: "pre-line" } } }}
    >
      <Stack className="usage-limits-widget" spacing={0.75}>
        {windows.map((window, index) => (
          <UsageWindowBar key={`${window.label}:${index}`} window={window} />
        ))}
      </Stack>
    </Tooltip>
  );
}

export const UsageLimitsWidgetX = observer(UsageLimitsWidget);

function compareUsageWindows(left: OpenCodexUsageWindow, right: OpenCodexUsageWindow): number {
  return readWindowSortValue(left) - readWindowSortValue(right);
}

function readWindowSortValue(window: OpenCodexUsageWindow): number {
  if (window.label === "5h") {
    return 0;
  }

  if (window.label === "weekly") {
    return 1;
  }

  return 2;
}

function formatReset(resetsAt: string | null): string {
  if (resetsAt === null) {
    return "-";
  }

  return new Date(resetsAt).toLocaleString();
}
